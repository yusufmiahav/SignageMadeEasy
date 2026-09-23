// Every action here mirrors an existing control in the hub's own web app (Home
// screen's force-content/force-announcement/blackout buttons, Settings' per-device
// "Identify" flash button) — same hub endpoints, same "group OR standalone device"
// targeting model (a device inside a group is controlled through its group, never
// individually — see api/types.ts's Device.forcedContentId comment in the main repo).

// 'all' + every group + every standalone (no-group) device — the same set of things
// the web app's own "force on every screen" buttons fan out over.
function buildTargetChoices(self) {
	const choices = [{ id: 'all', label: 'All screens' }]
	for (const g of self.groups) choices.push({ id: `group:${g.id}`, label: `Group: ${g.name}` })
	for (const d of self.devices) {
		if (!d.groupId) choices.push({ id: `device:${d.id}`, label: `Screen: ${d.name}` })
	}
	return choices
}

function buildContentChoices(self) {
	// Announcements aren't "content" in the force-content sense — same filter
	// ForceContentDialog.tsx applies in the web app.
	return self.library.filter((i) => i.type !== 'announcement').map((i) => ({ id: i.id, label: i.name }))
}

function buildAnnouncementChoices(self) {
	return self.library.filter((i) => i.type === 'announcement').map((i) => ({ id: i.id, label: i.name }))
}

// Resolves a target choice into the group ids / standalone device ids to act on for
// force-content / force-announcement / blackout — these three all share the exact
// same "group or standalone device" scope in the hub's own data model.
function resolveTarget(self, targetId) {
	if (targetId === 'all') {
		return {
			groupIds: self.groups.map((g) => g.id),
			deviceIds: self.devices.filter((d) => !d.groupId).map((d) => d.id),
		}
	}
	if (typeof targetId === 'string' && targetId.startsWith('group:')) {
		return { groupIds: [targetId.slice('group:'.length)], deviceIds: [] }
	}
	if (typeof targetId === 'string' && targetId.startsWith('device:')) {
		return { groupIds: [], deviceIds: [targetId.slice('device:'.length)] }
	}
	return { groupIds: [], deviceIds: [] }
}

// Flash is different: it's a real per-screen hardware action, so a "group" target
// means every physical device IN that group (not the group record itself).
function resolveFlashDeviceIds(self, targetId) {
	if (targetId === 'all') return self.devices.map((d) => d.id)
	if (typeof targetId === 'string' && targetId.startsWith('group:')) {
		const groupId = targetId.slice('group:'.length)
		return self.devices.filter((d) => d.groupId === groupId).map((d) => d.id)
	}
	if (typeof targetId === 'string' && targetId.startsWith('device:')) return [targetId.slice('device:'.length)]
	return []
}

async function applyToTarget(self, targetId, { onGroup, onDevice }) {
	const { groupIds, deviceIds } = resolveTarget(self, targetId)
	await Promise.allSettled([...groupIds.map(onGroup), ...deviceIds.map(onDevice)])
	await self.refreshState().catch(() => {
		/* refreshState already logs/updates status on failure */
	})
}

function getActionDefinitions(self) {
	return {
		force_content: {
			name: 'Force content',
			options: [
				{ type: 'dropdown', id: 'target', label: 'Target', choices: buildTargetChoices(self), default: 'all' },
				{ type: 'dropdown', id: 'content', label: 'Content', choices: buildContentChoices(self), default: buildContentChoices(self)[0]?.id ?? '' },
			],
			callback: async (event) => {
				const libId = event.options.content
				await applyToTarget(self, event.options.target, {
					onGroup: (id) => self.hub.setForcedContent(id, libId),
					onDevice: (id) => self.hub.setDeviceForcedContent(id, libId),
				})
			},
		},
		clear_forced_content: {
			name: 'Clear forced content (back to rolling schedule)',
			options: [{ type: 'dropdown', id: 'target', label: 'Target', choices: buildTargetChoices(self), default: 'all' }],
			callback: async (event) => {
				await applyToTarget(self, event.options.target, {
					onGroup: (id) => self.hub.setForcedContent(id, null),
					onDevice: (id) => self.hub.setDeviceForcedContent(id, null),
				})
			},
		},
		force_announcement: {
			name: 'Force announcement on',
			options: [
				{ type: 'dropdown', id: 'target', label: 'Target', choices: buildTargetChoices(self), default: 'all' },
				{
					type: 'dropdown',
					id: 'announcement',
					label: 'Announcement',
					choices: buildAnnouncementChoices(self),
					default: buildAnnouncementChoices(self)[0]?.id ?? '',
				},
			],
			callback: async (event) => {
				const announcementId = event.options.announcement
				await applyToTarget(self, event.options.target, {
					onGroup: (id) => self.hub.setForcedAnnouncement(id, announcementId),
					// A standalone screen has no separate "forced" field — its own
					// announcementId + announcementOn IS the forcing mechanism (see
					// Device.forcedContentId's comment in the main repo's api/types.ts).
					onDevice: (id) => self.hub.setDeviceAnnouncement(id, announcementId),
				})
			},
		},
		clear_announcement: {
			name: 'Clear/disable announcement',
			options: [{ type: 'dropdown', id: 'target', label: 'Target', choices: buildTargetChoices(self), default: 'all' }],
			callback: async (event) => {
				await applyToTarget(self, event.options.target, {
					onGroup: (id) => self.hub.setForcedAnnouncement(id, null),
					onDevice: (id) => self.hub.setDeviceAnnouncement(id, null),
				})
			},
		},
		set_blackout: {
			name: 'Set blackout',
			options: [
				{ type: 'dropdown', id: 'target', label: 'Target', choices: buildTargetChoices(self), default: 'all' },
				{
					type: 'dropdown',
					id: 'blackout',
					label: 'Blackout',
					choices: [
						{ id: 'on', label: 'On (plain black screen)' },
						{ id: 'off', label: 'Off (back to normal)' },
					],
					default: 'on',
				},
			],
			callback: async (event) => {
				const blackout = event.options.blackout === 'on'
				await applyToTarget(self, event.options.target, {
					onGroup: (id) => self.hub.setGroupBlackout(id, blackout),
					onDevice: (id) => self.hub.setDeviceBlackout(id, blackout),
				})
			},
		},
		flash: {
			name: 'Flash screen(s)',
			options: [{ type: 'dropdown', id: 'target', label: 'Target', choices: buildTargetChoices(self), default: 'all' }],
			callback: async (event) => {
				const deviceIds = resolveFlashDeviceIds(self, event.options.target)
				if (deviceIds.length === 0) {
					self.log('warn', 'Flash: no screens matched this target')
					return
				}
				// Best-effort, same as the web app's own flash button — a screen that's
				// briefly unreachable shouldn't stop the rest from flashing.
				const results = await Promise.allSettled(deviceIds.map((id) => self.hub.flashDevice(id)))
				const failed = results.filter((r) => r.status === 'rejected').length
				if (failed > 0) {
					self.log('warn', `Flashed ${deviceIds.length - failed}/${deviceIds.length} screen(s) — ${failed} unreachable`)
				} else {
					self.log('info', `Flashing ${deviceIds.length} screen(s)…`)
				}
			},
		},
	}
}

module.exports = { getActionDefinitions, buildTargetChoices, buildContentChoices, buildAnnouncementChoices, resolveTarget, resolveFlashDeviceIds }
