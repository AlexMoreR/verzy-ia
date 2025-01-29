const admin = require('firebase-admin');

// Inicializa Firebase
// const serviceAccount = require('./verzy-ai-firebase-adminsdk-7qx9z-0c140670cd.json'); // Descarga tu llave desde Firebase
// admin.initializeApp({
//     credential: admin.credential.cert(serviceAccount),
//     databaseURL: "https://verzy-ai-default-rtdb.firebaseio.com"
// });

//const db = admin.firestore();

class FirebaseAdapter {
    constructor({db}) {
        this.db = db;
    }

    async getPrevByNumber(key) {
        console.log('GetprevbyNumber KEY: ', key)
        const snapshot = await this.db.ref(`bot-interactions/${key}`).once('value');
        if (!snapshot.exists()) {
            return null; // No hay datos previos
        }
        return snapshot.val(); // Retorna los datos directamente
    } 

    async save(key, value) {
        console.log("KEY & VALUE: ", key, value)
        try {
            await this.db.ref(`bot-interactions/${key.from}`).set({
                ...value,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
        } catch (error) {
            console.log("Error firebase: ", error)
        }
    }

    async delete(key) {
        await this.db.ref(`bot-interactions/${key.from}`).remove();
    } 
}

module.exports = FirebaseAdapter; 