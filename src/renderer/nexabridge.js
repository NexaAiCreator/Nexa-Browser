
// Nexa Bridge - The Core Communication Layer
let appwriteClient = null;
let account = null;
let databases = null;

async function initAppwrite() {
    if (appwriteClient) return;
    try {
        if (typeof Appwrite !== 'undefined') {
            appwriteClient = new Appwrite.Client()
                .setEndpoint('https://sgp.cloud.appwrite.io/v1')
                .setProject('6a1c615b001a7362068c');
            account = new Appwrite.Account(appwriteClient);
            databases = new Appwrite.Databases(appwriteClient);
        } else {
            throw new Error("Appwrite SDK not found");
        }
    } catch (e) { throw e; }
}

window.Nexa = {
    async checkSession() {
        try {
            await initAppwrite();
            const user = await account.get();
            return { success: true, user };
        } catch (e) {
            return { success: false, error: "No active session" };
        }
    },
    async login(email, password) {
        try {
            await initAppwrite();
            try {
                await account.createEmailPasswordSession(email, password);
            } catch (e) {
                if (e.message && e.message.includes("session is active")) {
                    // Session already active, this is a success state
                } else {
                    throw e;
                }
            }
            const user = await account.get();
            return { success: true, user };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },
    async getProfile() {
        try {
            await initAppwrite();
            return await account.get();
        } catch (e) { return { error: "Not authenticated" }; }
    },
    async call(method, ...params) {
        try {
            const response = await fetch(`http://127.0.0.1:8081/rpc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ method: method, params: params, token: await this.getSessionToken() })
            });
            return await response.json();
        } catch (e) { return { error: "Nexa Backend is offline" }; }
    },
    async getSessionToken() {
        try {
            await initAppwrite();
            const session = await account.getSession('current');
            return session.$id;
        } catch (e) { return null; }
    }
};
