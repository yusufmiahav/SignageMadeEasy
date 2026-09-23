function getVariableDefinitions() {
	return [
		{ variableId: 'online_count', name: 'Screens online' },
		{ variableId: 'offline_count', name: 'Screens offline' },
		{ variableId: 'total_count', name: 'Screens total' },
	]
}

module.exports = { getVariableDefinitions }
