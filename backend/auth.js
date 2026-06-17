const sdk = require('node-appwrite');

const client = new sdk.Client();
client
    .setEndpoint('https://sgp.cloud.appwrite.io/v1')
    .setProject('6a1c615b001a7362068c')
    .setKey('standard_52864d55abf8059676aa7cd33b70e71cf28bd7b9177cd3aeb2f32231ceae994f82c09901f28f5d69df9e3eec9b39052fdbbe9fea99cffcc202cc04b938bd51e55f51c0d91cd7937b33931447e005cfe9e14d64ef73bef8ff3a6ca9027254ede562438268f83a25efb5030da57416129a3ccdc1a2d02c46079fe37f0b86b5f3a1');

const account = new sdk.Account(client);
const users = new sdk.Users(client);
const databases = new sdk.Databases(client);

module.exports = {
    async login(email, password) {
        try {
            // In a real production app, you'd handle sessions differently
            // For the browser bridge, we verify credentials and return user data
            const session = await account.createEmailPasswordSession(email, password);
            const user = await account.get();
            return { success: true, user };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    async getUserProfile(userId) {
        try {
            return await users.get(userId);
        } catch (e) {
            return { error: e.message };
        }
    },

    async getPreferences(userId) {
        try {
            // Assuming preferences are stored in a specific collection in Appwrite
            // Update databaseId and collectionId as per your Appwrite setup
            const result = await databases.listDocuments('preferences', 'user_prefs', [
                sdk.Query.equal('userId', userId)
            ]);
            return result.documents[0] || { theme: 'dark', ai_model: 'default' };
        } catch (e) {
            return { theme: 'dark', ai_model: 'default', error: e.message };
        }
    }
};
