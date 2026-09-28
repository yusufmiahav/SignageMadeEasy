const { InstanceBase, InstanceStatus, runEntrypoint } = require('@companion-module/base')
const { HubClient, HubApiError } = require('./api')
const { getConfigFields } = require('./config')
const { getActionDefinitions } = require('./actions')
const { getFeedbackDefinitions } = require('./feedbacks')
const { getVariableDefinitions } = require('./variables')
const upgradeScripts = require('./upgrades')

const DEFAULT_POLL_INTERVAL_MS = 4000

class ModuleInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.groups = []
		this.devices = []
		this.library = []
		this.pollTimer = null
		this.hub = null
	}

	async init(config) {
		this.config = config
		this.hub = new HubClient(this)
		this.updateStatus(InstanceStatus.Connecting)
		this.setVariableDefinitions(getVariableDefinitions())
		this.updateActions()
		this.updateFeedbacks()
		await this.refreshState({ initial: true }).catch(() => {
			/* status already set to ConnectionFailure inside refreshState */
		})
		this.startPolling()
	}

	async configUpdated(config) {
		this.config = config
		this.stopPolling()
		// A changed host/pin makes the old session cookie meaningless even if it
		// hasn't technically expired yet — force a fresh login against whatever this
		// config now points at, rather than silently reusing the old hub's cookie.
		if (this.hub) this.hub.cookie = null
		this.updateStatus(InstanceStatus.Connecting)
		await this.refreshState({ initial: true }).catch(() => {})
		this.startPolling()
	}

	async destroy() {
		this.stopPolling()
	}

	getConfigFields() {
		return getConfigFields()
	}

	startPolling() {
		this.stopPolling()
		const interval = Number(this.config?.pollInterval) > 0 ? Number(this.config.pollInterval) : DEFAULT_POLL_INTERVAL_MS
		this.pollTimer = setInterval(() => {
			this.refreshState().catch((err) => this.log('debug', `Poll failed: ${err?.message ?? err}`))
		}, interval)
	}

	stopPolling() {
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = null
		}
	}

	// Pulls groups/devices/library fresh from the hub, refreshes action/feedback
	// choices only when the underlying list actually changed (so editing a button's
	// options mid-session doesn't get disrupted by an unrelated redefinition every
	// poll), then always re-evaluates feedbacks/variables since those need to track
	// fast-changing fields (online/offline, forced/blackout on-off) every cycle.
	async refreshState({ initial = false } = {}) {
		try {
			const [groups, devices, library] = await Promise.all([this.hub.listGroups(), this.hub.listDevices(), this.hub.listLibrary()])

			const snapshot = (list, keys) => JSON.stringify(list.map((item) => keys.map((k) => item[k])))
			const choicesChanged =
				snapshot(groups, ['id', 'name']) !== snapshot(this.groups, ['id', 'name']) ||
				snapshot(devices, ['id', 'name', 'groupId']) !== snapshot(this.devices, ['id', 'name', 'groupId']) ||
				snapshot(library, ['id', 'name', 'type']) !== snapshot(this.library, ['id', 'name', 'type'])

			this.groups = groups
			this.devices = devices
			this.library = library

			this.updateStatus(InstanceStatus.Ok)
			if (initial || choicesChanged) {
				this.updateActions()
				this.updateFeedbacks()
			}
			this.checkFeedbacks('force_content_active', 'announcement_active', 'blackout_active', 'device_online')
			this.updateVariables()
		} catch (err) {
			const message = err instanceof HubApiError ? err.message : String(err?.message ?? err)
			this.updateStatus(InstanceStatus.ConnectionFailure, message)
			throw err
		}
	}

	updateVariables() {
		const online = this.devices.filter((d) => d.status === 'online').length
		this.setVariableValues({
			online_count: online,
			offline_count: this.devices.length - online,
			total_count: this.devices.length,
		})
	}

	updateActions() {
		this.setActionDefinitions(getActionDefinitions(this))
	}

	updateFeedbacks() {
		this.setFeedbackDefinitions(getFeedbackDefinitions(this))
	}
}

runEntrypoint(ModuleInstance, upgradeScripts)
