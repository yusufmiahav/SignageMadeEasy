// Talks to the SignageMadeEasy hub's own REST API — the exact same endpoints the
// hub's web control app uses (see the main repo's src/api/httpClient.ts), so this
// module never duplicates business logic, just calls the same PUT/POST routes.
//
// Auth: the hub gates its management API behind a single shared PIN (see
// hub/src/auth.ts) rather than per-user accounts or an API key — logging in sets an
// HttpOnly session cookie good for 30 days, signed with a secret the hub persists to
// disk (so it survives the hub restarting). This client logs in once, reuses that
// cookie for every request, and transparently re-logs in on a 401 (the cookie
// expired, or the hub's data dir — and secret — was reset).

const REQUEST_TIMEOUT_MS = 5000

class HubApiError extends Error {
	constructor(message, status) {
		super(message)
		this.name = 'HubApiError'
		this.status = status
	}
}

class HubClient {
	constructor(instance) {
		this.instance = instance // for instance.log(...)
		this.cookie = null
		this.loginPromise = null
	}

	get baseUrl() {
		const { host, port } = this.instance.config
		const p = port && Number(port) > 0 ? Number(port) : 80
		return `http://${host}:${p}`
	}

	// Multiple requests can discover an expired/missing cookie at once (e.g. a burst
	// of button presses) — sharing one in-flight login promise instead of each firing
	// its own /api/auth/login avoids hammering the hub and racing to set this.cookie.
	async login() {
		if (this.loginPromise) return this.loginPromise
		this.loginPromise = this._login().finally(() => {
			this.loginPromise = null
		})
		return this.loginPromise
	}

	async _login() {
		const { pin } = this.instance.config
		let res
		try {
			res = await fetch(`${this.baseUrl}/api/auth/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pin: pin ?? '' }),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			})
		} catch (err) {
			throw new HubApiError(`Could not reach the hub at ${this.baseUrl}: ${err.message}`)
		}
		if (res.status === 401) {
			throw new HubApiError('Incorrect PIN')
		}
		if (!res.ok) {
			throw new HubApiError(`Login failed: HTTP ${res.status}`, res.status)
		}
		// Node's fetch (undici) exposes every Set-Cookie header via getSetCookie() —
		// headers.get('set-cookie') would silently fold multiple cookies into one
		// invalid string, so this is not just a style preference.
		const rawCookies =
			typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean)
		const sessionCookie = rawCookies.find((c) => c.startsWith('signage_session='))
		if (!sessionCookie) {
			throw new HubApiError('Logged in but the hub did not return a session cookie')
		}
		this.cookie = sessionCookie.split(';')[0]
	}

	async request(path, { method = 'GET', body } = {}, isRetry = false) {
		if (!this.cookie) await this.login()
		let res
		try {
			res = await fetch(`${this.baseUrl}${path}`, {
				method,
				headers: {
					'Content-Type': 'application/json',
					Cookie: this.cookie,
				},
				body: body !== undefined ? JSON.stringify(body) : undefined,
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			})
		} catch (err) {
			throw new HubApiError(`Could not reach the hub at ${this.baseUrl}: ${err.message}`)
		}
		if (res.status === 401 && !isRetry) {
			// Session cookie expired/invalid (e.g. the hub's data dir, and its
			// session-signing secret, was reset) — log in fresh and retry exactly
			// once, so a 30-day-old cookie doesn't take the module offline forever.
			this.cookie = null
			return this.request(path, { method, body }, true)
		}
		if (!res.ok) {
			const text = await res.text().catch(() => '')
			throw new HubApiError(`HTTP ${res.status} ${method} ${path}${text ? `: ${text}` : ''}`, res.status)
		}
		if (res.status === 204) return undefined
		return res.json()
	}

	listGroups() {
		return this.request('/api/groups')
	}

	listDevices() {
		return this.request('/api/devices')
	}

	listLibrary() {
		return this.request('/api/library')
	}

	setForcedContent(groupId, libId) {
		return this.request(`/api/groups/${groupId}/forced`, { method: 'PUT', body: { libId } })
	}

	setDeviceForcedContent(deviceId, libId) {
		return this.request(`/api/devices/${deviceId}/forced`, { method: 'PUT', body: { libId } })
	}

	setForcedAnnouncement(groupId, announcementId) {
		return this.request(`/api/groups/${groupId}/forced-announcement`, { method: 'PUT', body: { announcementId } })
	}

	setDeviceAnnouncement(deviceId, announcementId) {
		return this.request(`/api/devices/${deviceId}/announcement`, { method: 'PUT', body: { announcementId } })
	}

	setGroupBlackout(groupId, blackout) {
		return this.request(`/api/groups/${groupId}/blackout`, { method: 'PUT', body: { blackout } })
	}

	setDeviceBlackout(deviceId, blackout) {
		return this.request(`/api/devices/${deviceId}/blackout`, { method: 'PUT', body: { blackout } })
	}

	// Direct hub->Pi call (bypasses the group/device DB state entirely) — can 502 if
	// the screen is briefly unreachable; callers should treat that as best-effort,
	// same as the web app's own flash button does.
	flashDevice(deviceId) {
		return this.request(`/api/devices/${deviceId}/identify-flash`, { method: 'POST' })
	}
}

module.exports = { HubClient, HubApiError }
