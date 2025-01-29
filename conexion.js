const fs = require("fs");
const admin = require('firebase-admin');
const { exec } = require('child_process');

// Inicialización de la app de Firebase
const serviceAccount = require("./watbot-c14e5-firebase-adminsdk-6rstq-d831ae39da.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://watbot-c14e5-default-rtdb.firebaseio.com/',
    storageBucket: 'gs://watbot-c14e5.appspot.com'
});

const db = admin.database();

let clavesAnteriores = []; // Variable para almacenar las claves anteriores

// Función para cargar usuarios y generar configuración
async function cargarUsuarios() {
    try {
        const usuariosRef = db.ref("bot_clientes");
        usuariosRef.on("value", async (snapshot) => {
          const data = snapshot.val();
    
          if (!data) {
            console.log("No hay usuarios en bot_clientes.");
            return;
          }
    
          const clavesActuales = Object.keys(data);
          console.log("Claves de usuarios en bot_clientes:", clavesActuales);
    
          // Detectar cambios
          const nuevosUsuarios = obtenerCambios(clavesActuales);
    
          if (nuevosUsuarios.length > 0) {
            console.log("Nuevos usuarios detectados:", nuevosUsuarios);
            await generarConfiguracion(clavesActuales);
            await ejecutarPM2(nuevosUsuarios);
          } else {
            console.log("No hay cambios en las claves de usuarios en bot_clientes.");
          }
    
          // Actualizar claves anteriores
          clavesAnteriores = clavesActuales;
        });
    
        console.log("Escuchando cambios en bot_clientes...");
      } catch (error) {
        console.error("Error al cargar usuarios:", error);
      }
}

// Función para obtener los cambios entre las claves actuales y anteriores
function obtenerCambios(clavesActuales) {
    // Filtramos las claves que están en clavesActuales pero no en clavesAnteriores
    return clavesActuales.filter(clave => !clavesAnteriores.includes(clave));
}

// Función para generar configuración en el archivo ecosystem.config.js
async function generarConfiguracion(usuarios) {
    try {
      const apps = usuarios.map((usuario) => ({
        name: usuario,
        script: "app.js",
        args: `--usuario_nuevo=${usuario}`,
        instances: 1,
        exec_mode: "fork",
      }));
  
      const config = `module.exports = { apps: ${JSON.stringify(apps, null, 2)} };`;
      fs.writeFileSync("ecosystem.config.js", config);
      console.log("Archivo ecosystem.config.js actualizado.");
    } catch (error) {
      console.error("Error al generar el archivo de configuración:", error);
    }
}

// Función para ejecutar pm2 start
function ejecutarPM2(usuarios) {
    usuarios.forEach(usuario => {
        // Verificamos si el bot ya está en ejecución
        exec(`pm2 describe ${usuario}`, (error, stdout, stderr) => {
            if (!error) {
                // Si no hay error, significa que el proceso existe
                console.log(`${usuario} ya está iniciado en pm2.`);
            } else {
                // Si el proceso no existe, lo iniciamos
                exec(`pm2 start app.js --name ${usuario} -- --usuario_nuevo=${usuario}`, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Error al iniciar pm2 para ${usuario}: ${error.message}`);
                        return;
                    }
                    if (stderr) {
                        console.error(`Error al iniciar pm2 para ${usuario}: ${stderr}`);
                        return;
                    }
                    console.log(`pm2 iniciado para ${usuario}: ${stdout}`);
                });
            }
        });
    });
}

// Ejecutar la función para cargar usuarios y generar configuración
cargarUsuarios();
