const { combineRgb } = require('@companion-module/base')

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
			description: 'True while the chosen group/screen has content forced on (overriding its schedule).',
			defaultStyle: { bgcolor: combineRgb(236, 48, 19), color: combineRgb(255, 255, 255) },
			options: [{ type: 'dropdown', id: 'target', label: 'Target', choices: buildSingleTargetChoices(self), default: buildSingleTargetChoices(self)[0]?.id ?? '' }],
			callback: (feedback) => {
				const targetId = feedback.options.target
				if (typeof targetId === 'string' && targetId.startsWith('group:')) {
					return !!findGroup(self, targetId.slice('group:'.length))?.forcedContentId
				}
				if (typeof targetId === 'string' && targetId.startsWith('device:')) {
					return !!findDevice(self, targetId.slice('device:'.length))?.forcedContentId
				}
				return false
			},
		},
		announcement_active: {
			type: 'boolean',
			name: 'Forced announcement is active',
			description: "True while the chosen group/screen has an announcement forced on via this module's own actions.",
			defaultStyle: { bgcolor: combineRgb(236, 48, 19), color: combineRgb(255, 255, 255) },
			options: [{ type: 'dropdown', id: 'target', label: 'Target', choices: buildSingleTargetChoices(self), default: buildSingleTargetChoices(self)[0]?.id ?? '' }],
			callback: (feedback) => {
				const targetId = feedback.options.target
				if (typeof targetId === 'string' && targetId.startsWith('group:')) {
					return !!findGroup(self, targetId.slice('group:'.length))?.forcedAnnouncementId
				}
				if (typeof targetId === 'string' && targetId.startsWith('device:')) {
					const d = findDevice(self, targetId.slice('device:'.length))
					return !!(d?.announcementId && d.announcementOn)
				}
				return false
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
