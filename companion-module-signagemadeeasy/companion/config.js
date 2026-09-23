const { Regex } = require('@companion-module/base')

function getConfigFields() {
	return [
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'Setup',
			value:
				'Point this at the machine running your SignageMadeEasy hub (the same PIN as the web control app — default "Abc123" unless changed via SIGNAGE_PIN).',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Hub host / IP',
			width: 6,
			default: '127.0.0.1',
			regex: Regex.HOSTNAME,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Hub port',
			width: 3,
			default: 4000,
			min: 1,
			max: 65535,
		},
		{
			type: 'textinput',
			id: 'pin',
			label: 'Hub PIN',
			width: 3,
			default: 'Abc123',
		},
		{
			type: 'number',
			id: 'pollInterval',
			label: 'Poll interval (ms)',
			width: 6,
			default: 4000,
			min: 1000,
			max: 60000,
			tooltip: 'How often to refresh screens/groups/content from the hub — used to keep action dropdowns, feedbacks, and variables current.',
		},
	]
}

module.exports = { getConfigFields }
