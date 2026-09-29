const { combineRgb } = require('@companion-module/base')
const { buildContentChoices, buildAnnouncementChoices } = require('./actions')

// '' means "any" — the feedback's original, still-default behavior (true while
// *something* is forced) rather than narrowing to one specific item. Existing
// buttons configured before this option existed keep working unchanged, since a
// missing option value falls back to this same default.
const ANY_ITEM = ''

// Feedbacks target one specific group or standalone screen — there's no single
// boolean state for "all screens" (they can each be in a different state), so
// unlike the actions' target dropdown this one has no 'all' choice.
function buildSingleTargetChoices(self) {
	const choices = []
	for (const g of self.groups) choices.push({ id: `group:${g.id}`, label: `Group: ${g.name}` })
	for (const d of self.devices) {
		if (!d.groupId) choices.push({ id: `device:${d.id}`, label: `Screen: ${d.name}` })
	}
	return choices
}

function buildDeviceChoices(self) {
	return self.devices.map((d) => ({ id: d.id, label: d.name }))
}

function findGroup(self, id) {
	return self.groups.find((g) => g.id === id)
}

function findDevice(self, id) {
	return self.devices.find((d) => d.id === id)
}

function getFeedbackDefinitions(self) {
	return {
		force_content_active: {
			type: 'boolean',
			name: 'Forced content is active',
			description:
				'True while the chosen group/screen has content forced on (overriding its schedule) — narrow "Content" to a specific item to light up only when e.g. "Photo 1" is the one live on "Screen 1", rather than any forced content at all.',
			defaultStyle: { bgcolor: combineRgb(236, 48, 19), color: combineRgb(255, 255, 255) },
			options: [
				{ type: 'dropdown', id: 'target', label: 'Target', choices: buildSingleTargetChoices(self), default: buildSingleTargetChoices(self)[0]?.id ?? '' },
				{
					type: 'dropdown',
					id: 'content',
					label: 'Content (optional — "Any" matches any forced content)',
					choices: [{ id: ANY_ITEM, label: 'Any content' }, ...buildContentChoices(self)],
					default: ANY_ITEM,
				},
			],
			callback: (feedback) => {
				const targetId = feedback.options.target
				const contentId = feedback.options.content ?? ANY_ITEM
				let activeId = null
				if (typeof targetId === 'string' && targetId.startsWith('group:')) {
					activeId = findGroup(self, targetId.slice('group:'.length))?.forcedContentId ?? null
				} else if (typeof targetId === 'string' && targetId.startsWith('device:')) {
					activeId = findDevice(self, targetId.slice('device:'.length))?.forcedContentId ?? null
				}
				if (!activeId) return false
				return contentId === ANY_ITEM ? true : activeId === contentId
			},
		},
		announcement_active: {
			type: 'boolean',
			name: 'Forced announcement is active',
			description:
				"True while the chosen group/screen has an announcement forced on via this module's own actions — narrow \"Announcement\" to a specific one to light up only when that exact announcement is live, rather than any forced announcement at all.",
			defaultStyle: { bgcolor: combineRgb(236, 48, 19), color: combineRgb(255, 255, 255) },
			options: [
				{ type: 'dropdown', id: 'target', label: 'Target', choices: buildSingleTargetChoices(self), default: buildSingleTargetChoices(self)[0]?.id ?? '' },
				{
					type: 'dropdown',
					id: 'announcement',
					label: 'Announcement (optional — "Any" matches any forced announcement)',
					choices: [{ id: ANY_ITEM, label: 'Any announcement' }, ...buildAnnouncementChoices(self)],
					default: ANY_ITEM,
				},
			],
			callback: (feedback) => {
				const targetId = feedback.options.target
				const announcementId = feedback.options.announcement ?? ANY_ITEM
				let activeId = null
				if (typeof targetId === 'string' && targetId.startsWith('group:')) {
					activeId = findGroup(self, targetId.slice('group:'.length))?.forcedAnnouncementId ?? null
				} else if (typeof targetId === 'string' && targetId.startsWith('device:')) {
					const d = findDevice(self, targetId.slice('device:'.length))
					activeId = d?.announcementId && d.announcementOn ? d.announcementId : null
				}
				if (!activeId) return false
				return announcementId === ANY_ITEM ? true : activeId === announcementId
			},
		},
		blackout_active: {
			type: 'boolean',
			name: 'Blackout is active',
			description: 'True while the chosen group/screen is blacked out.',
			defaultStyle: { bgcolor: combineRgb(200, 0, 0), color: combineRgb(255, 255, 255) },
			options: [{ type: 'dropdown', id: 'target', label: 'Target', choices: buildSingleTargetChoices(self), default: buildSingleTargetChoices(self)[0]?.id ?? '' }],
			callback: (feedback) => {
				const targetId = feedback.options.target
				if (typeof targetId === 'string' && targetId.startsWith('group:')) {
					return !!findGroup(self, targetId.slice('group:'.length))?.blackout
				}
				if (typeof targetId === 'string' && targetId.startsWith('device:')) {
					return !!findDevice(self, targetId.slice('device:'.length))?.blackout
				}
				return false
			},
		},
		device_online: {
			type: 'boolean',
			name: 'Screen is online',
			description: 'True while the chosen screen has heartbeated recently.',
			defaultStyle: { bgcolor: combineRgb(0, 153, 51), color: combineRgb(255, 255, 255) },
			options: [{ type: 'dropdown', id: 'device', label: 'Screen', choices: buildDeviceChoices(self), default: buildDeviceChoices(self)[0]?.id ?? '' }],
			callback: (feedback) => findDevice(self, feedback.options.device)?.status === 'online',
		},
	}
}

module.exports = { getFeedbackDefinitions, buildSingleTargetChoices, buildDeviceChoices }
