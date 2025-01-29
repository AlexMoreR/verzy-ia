//require("./instrument");

const FirebaseAdapter = require("./FirebaseAdapter")

require("dotenv").config();
const axios = require('axios');
const uuid = require('uuid');
const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require("@bot-whatsapp/bot");
const BaileysProvider = require("@bot-whatsapp/provider/baileys");
const MockAdapter = require("@bot-whatsapp/database/mock");
const { handlerAI } = require("./utils");
const { textToVoice } = require("./services/eventlab");
const stringSimilarity = require("string-similarity");
const { Configuration, OpenAIApi } = require("openai");
const fs = require("fs");
const { convertOggMp3 } = require("./services/convert");
const admin = require('firebase-admin');
const serviceAccount = require("./watbot-c14e5-firebase-adminsdk-6rstq-d831ae39da.json");
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { WAMessageProto } = require('@adiwajshing/baileys');
const { Readable } = require('stream');

const { pipeline } = require('stream');
const fsPromises = require('fs').promises;
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);

//Funciones de embedding

// Sobrescribir console.log
const originalLog = console.log;
console.log = (...args) => {
  const fechaYHora = new Date().toLocaleString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  originalLog(`[${fechaYHora}]`, ...args);
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://watbot-c14e5-default-rtdb.firebaseio.com',
  storageBucket: 'gs://watbot-c14e5.appspot.com'
}); 

const db = admin.database();
const st = admin.storage().bucket();

let numero_mensajes = 0;
let limite_gratuito = 100;
let valor_api = "";
let valor_organizacion = "";
let valor_modelo = "";

let palabrasClaveConfirmar = [];

let mensajeASoporte = "📝 De acuerdo, ¡He tomado tu solicitud!\n\n👨🏻‍💻Un Asesor se pondrá en contacto contigo a la brevedad.⏰"; // Valor por defecto
let fraseCatalogo = "*¿En qué le puedo ayudar hoy?*"; // Valor por defecto

let tiempo_retraso_respuesta = 3000; // Valor por defecto en milisegundos (5 segundos)

async function regenerarEmbeddingsDeUnDisparador(usuario, disparadorKey, disparadorData) {
  const { disparadores: keywordsArray, embding } = disparadorData || {};

  // Si no hay embding o no hay palabras clave, entonces no hay nada que recalcular
  if (!embding || !keywordsArray || !Array.isArray(keywordsArray) || keywordsArray.length === 0) {
    // Eliminar cualquier embedding previa de este disparador
    const embeddingsPath = `usuarios/${usuario}/embeddings.json`;
    let embeddingsActuales = [];
    if (fs.existsSync(embeddingsPath)) {
      embeddingsActuales = JSON.parse(fs.readFileSync(embeddingsPath, "utf-8"));
    }
    embeddingsActuales = embeddingsActuales.filter(e => e.disparadorKey !== disparadorKey);
    fs.writeFileSync(embeddingsPath, JSON.stringify(embeddingsActuales, null, 2), "utf-8");
    embeddingsCargados = embeddingsActuales;
    console.log(`Embeddings eliminadas para ${disparadorKey} (sin embding o sin keywords).`);
    return;
  }

  // Generar nuevas embeddings
  const nuevasEmbeddings = [];
  for (let keyword of keywordsArray) {
    const contexto = `${keyword}. Instrucciones: ${embding}`;
    const embedding = await getEmbedding(contexto);
    nuevasEmbeddings.push({
      disparadorKey,
      keyword,
      embedding
    });
  }

  // Cargar embeddings actuales
  const embeddingsPath = `usuarios/${usuario}/embeddings.json`;
  let embeddingsActuales = [];
  if (fs.existsSync(embeddingsPath)) {
    embeddingsActuales = JSON.parse(fs.readFileSync(embeddingsPath, "utf-8"));
  }

  // Filtrar las previas del disparador
  embeddingsActuales = embeddingsActuales.filter(e => e.disparadorKey !== disparadorKey);

  // Agregar las nuevas
  embeddingsActuales.push(...nuevasEmbeddings);

  // Guardar el archivo actualizado
  fs.writeFileSync(embeddingsPath, JSON.stringify(embeddingsActuales, null, 2), "utf-8");
  console.log(`Embeddings actualizadas para ${disparadorKey} en ${embeddingsPath}`);

  // Actualizar en memoria
  embeddingsCargados = embeddingsActuales;
}

async function getEmbedding(text) {
  const configuracion = new Configuration({
    organization: valor_organizacion,
    apiKey: valor_api,
  });
  const openaiForEmbeddings = new OpenAIApi(configuracion);
  
  const response = await openaiForEmbeddings.createEmbedding({
    model: "text-embedding-ada-002", //modelo para detectar similiud semantica
    input: text
  });
  return response.data.data[0].embedding;
}

function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dotProduct / (magA * magB);
}

// Sección -1: Tiempo de retrasos

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Al inicio del archivo, después de las declaraciones de variables globales
let disparadoresCargados = {};
let embeddingsCargados = []; // Array para almacenar las embeddings cargadas desde el archivo.

// Función para guardar embeddings en un archivo JSON
async function guardarEmbeddings(usuario, disparadores) {
  const embeddings = [];

  for (let disparadorKey in disparadores) {
    const disparadorData = disparadores[disparadorKey];
    const { disparadores: keywordsArray, embding } = disparadorData || {};
    if (keywordsArray && Array.isArray(keywordsArray) && embding && embding.trim() !== "") {
      for (let keyword of keywordsArray) {
        const contexto = `${keyword}. Instrucciones: ${embding}`;
        const embedding = await getEmbedding(contexto);
        embeddings.push({
          disparadorKey,
          keyword,
          embedding
        });
      }
    }
  }

  const embeddingsPath = `usuarios/${usuario}/embeddings.json`;
  fs.writeFileSync(embeddingsPath, JSON.stringify(embeddings, null, 2), "utf-8");
  console.log(`Embeddings guardados en ${embeddingsPath}`);
}

// Función para cargar embeddings desde el archivo, si existe.
function cargarEmbeddingsDesdeArchivo(usuario) {
  const embeddingsPath = `usuarios/${usuario}/embeddings.json`;
  if (fs.existsSync(embeddingsPath)) {
    const data = fs.readFileSync(embeddingsPath, "utf-8");
    const embeddings = JSON.parse(data);
    console.log(`Embeddings cargados desde ${embeddingsPath}`);
    return embeddings;
  }
  return null;
}

// Función para cargar y mantener los disparadores en memoria
async function cargarDisparadores(usuario) {
  console.log('Iniciando carga de disparadores...');
  try {
    const disparadoresRef = db.ref(`bot_clientes/${usuario}/disparadores`);
    const snapshot = await disparadoresRef.once('value');
    
    if (snapshot.exists()) {
      disparadoresCargados = snapshot.val();
      console.log('Disparadores cargados exitosamente:', 
        Object.keys(disparadoresCargados).length, 'disparadores encontrados');
      
      Object.entries(disparadoresCargados).forEach(([key, disparador]) => {
        if (disparador.disparadores) {
          console.log(`Disparador [${key}]:`, disparador.disparadores);
        } else {
          console.warn(`Disparador [${key}] no tiene 'disparadores' definidos.`);
        }
      });

      // Primero intentamos cargar embeddings desde el archivo
      embeddingsCargados = cargarEmbeddingsDesdeArchivo(usuario);

      if (!embeddingsCargados) {
        console.log("No se encontraron embeddings, generándolas...");
        await guardarEmbeddings(usuario, disparadoresCargados);
        embeddingsCargados = cargarEmbeddingsDesdeArchivo(usuario); 
      }

    } else {
      console.log('No hay disparadores configurados para el usuario:', usuario);
      disparadoresCargados = {};
    }
  } catch (error) {
    console.error('Error al cargar disparadores:', error);
    disparadoresCargados = {};
  }
}

// Función para escuchar cambios en los disparadores y actualizar la memoria
async function escucharCambiosDisparadores(usuario) {
  const disparadoresRef = db.ref(`bot_clientes/${usuario}/disparadores`);

  // 1) Evento 'value': carga global
  disparadoresRef.on('value', async (snapshot) => {
    if (snapshot.exists()) {
      // Actualizar en memoria:
      disparadoresCargados = snapshot.val();
      console.log(
        'Disparadores actualizados en memoria:',
        Object.keys(disparadoresCargados).length,
        'disparadores encontrados'
      );

      // Mostrar palabras clave disponibles:
      Object.values(disparadoresCargados).forEach((disparador) => {
        if (disparador.disparadores) {
          console.log('Palabras clave disponibles:', disparador.disparadores);
        }
      });

      // === OPCIONAL: Re-generar embeddings de TODO si quieres forzar sincronización completa
      try {
        console.log('Re-generando embeddings para TODOS los disparadores (sincrónico) ...');
        await guardarEmbeddings(usuario, disparadoresCargados); 
        // O un bucle manual por cada disparador si así lo prefieres.
        console.log('Embeddings re-generadas tras evento "value".');
      } catch (error) {
        console.error('Error al regenerar embeddings globales:', error);
      }

    } else {
      console.log('No hay disparadores configurados para el usuario:', usuario);
      disparadoresCargados = {};
    }
  }, (error) => {
    console.error('Error al escuchar cambios en disparadores:', error);
  });

  // 2) Evento 'child_changed': un disparador existente ha cambiado
  disparadoresRef.on('child_changed', async (snapshot) => {
    const disparadorKey = snapshot.key;
    const disparadorData = snapshot.val();
    console.log(`Disparador ${disparadorKey} ha cambiado, regenerando embeddings...`);
    await regenerarEmbeddingsDeUnDisparador(usuario, disparadorKey, disparadorData);
  });

  // 3) Evento 'child_added': se ha añadido un nuevo disparador
  disparadoresRef.on('child_added', async (snapshot) => {
    const disparadorKey = snapshot.key;
    const disparadorData = snapshot.val();
    console.log(`Nuevo disparador ${disparadorKey}, generando embeddings...`);
    await regenerarEmbeddingsDeUnDisparador(usuario, disparadorKey, disparadorData);
  });

  // 4) Evento 'child_removed': se ha eliminado un disparador
  disparadoresRef.on('child_removed', async (snapshot) => {
    const disparadorKey = snapshot.key;
    console.log(`Disparador ${disparadorKey} eliminado, actualizando embeddings...`);
    // Llamamos a regenerarEmbeddingsDeUnDisparador con un objeto vacío para eliminar sus embeddings
    await regenerarEmbeddingsDeUnDisparador(usuario, disparadorKey, {});
  });
}

// Sección 0: Disparadores manuales

// Función para sincronizar imágenes y PDFs de Firebase con carpeta local
async function sincronizarArchivos(usuario) {
  try {
    const disparadoresRef = db.ref(`bot_clientes/${usuario}/disparadores`);
    const snapshot = await disparadoresRef.once('value');

    if (!snapshot.exists()) {
      console.log(`No se encontraron disparadores para el usuario ${usuario}`);
      return;
    }

      const disparadores = snapshot.val();

      for (let disparadorKey in disparadores) {
        const disparadorData = disparadores[disparadorKey];
        const { urls, storagePath_pdf } = disparadorData;

        // Directorio base para cada disparador
        const directorioBase = path.join('usuarios', usuario, 'disparadores', disparadorKey);

        // Crear directorios si no existen
        if (!fs.existsSync(directorioBase)) {
          fs.mkdirSync(directorioBase, { recursive: true });
          console.log(`Directorio creado: ${directorioBase}`);
        }

        // Descargar imágenes
        if (urls) {
          for (let index in urls) {
            const { storagePath } = urls[index];
            const nombreImagen = path.basename(storagePath);
            const rutaImagenLocal = path.join(directorioBase, nombreImagen);

            if (!fs.existsSync(rutaImagenLocal)) {
            console.log(`Descargando imagen desde Storage: ${storagePath}`);
            const archivoDescargado = await descargarArchivoDesdeFirebase(storagePath, rutaImagenLocal);

            // Verifica que efectivamente se haya descargado:
            if (!archivoDescargado || !fs.existsSync(rutaImagenLocal)) {
              console.warn(`No se pudo descargar la imagen: ${storagePath}`);
              continue; // No intentes usar un archivo que no existe
            }
              console.log(`Imagen descargada: ${rutaImagenLocal}`);
            } else {
              console.log(`Imagen ya existe localmente: ${rutaImagenLocal}`);
            }
          }
        }

        // Descargar PDF
        if (storagePath_pdf) {
          const nombrePDF = path.basename(storagePath_pdf);
          const rutaPDFLocal = path.join(directorioBase, nombrePDF);

          if (!fs.existsSync(rutaPDFLocal)) {
          console.log(`Descargando PDF desde Storage: ${storagePath_pdf}`);
          const archivoDescargado = await descargarArchivoDesdeFirebase(storagePath_pdf, rutaPDFLocal);

          // Verifica que efectivamente se haya descargado:
          if (!archivoDescargado || !fs.existsSync(rutaPDFLocal)) {
            console.warn(`No se pudo descargar o no existe el PDF: ${storagePath_pdf}`);
            continue;
          }

          // (Opcional) Verificar extensión o contentType del archivo PDF:
          const ext = path.extname(rutaPDFLocal).toLowerCase();
          if (ext !== '.pdf') {
            console.warn(`El archivo descargado no es un PDF: ${rutaPDFLocal}`);
            // Podrías eliminarlo o descartarlo según tu lógica
            continue;
          }

          console.log(`PDF descargado correctamente: ${rutaPDFLocal}`);
          } else {
            console.log(`PDF ya existe localmente: ${rutaPDFLocal}`);
          }
        }
      }
      console.log('Sincronización completada.');
  } catch (error) {
    console.error('Error al sincronizar archivos:', error);
  }
}

// Función para descargar archivos desde Firebase Storage
/**
/**
 * Descarga un archivo desde Firebase Storage con verificación de tamaño.
 * 
 * - Si el tamaño local descargado no coincide con el que indica Firebase,
 *   se elimina el archivo parcial y se reintenta (hasta maxRetries).
 * 
 * @param {string} storagePath - Ruta del archivo en Firebase Storage (p.ej. "Carpeta/Video.mp4").
 * @param {string} destinoLocal - Ruta local para guardar el archivo (p.ej. "videos/Video.mp4").
 * @param {number} maxRetries - Cantidad máxima de reintentos (default: 3).
 * @param {number} retryDelayMs - Milisegundos de pausa entre reintentos (default: 2000).
 * @returns {Promise<string|null>} Retorna la ruta local si el archivo se descargó completo, o null si falló.
 */
async function descargarArchivoDesdeFirebase(
  storagePath,
  destinoLocal,
  maxRetries = 3,
  retryDelayMs = 2000
) {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      console.log(`\n[.download()] Intento ${attempt + 1} de ${maxRetries} - Descargando: ${storagePath}`);

      // 1) Referencia al archivo en Cloud Storage
      const file = st.file(storagePath);

      // 2) Obtener metadatos para conocer "metadata.size"
      const [fileMetadata] = await file.getMetadata();
      const remoteSize = parseInt(fileMetadata.size, 10) || 0;
      console.log(`Tamaño remoto: ${remoteSize} bytes`);

      if (!remoteSize) {
        throw new Error(`El archivo remoto ${storagePath} no tiene un tamaño válido (0 bytes).`);
      }

      // 3) Descargar con .download() en modo resumable
      //    Esto no recodifica nada: descarga binario tal cual.
      await file.download({
        destination: destinoLocal,
        resumable: true,   // Descarga en modo "resumable" (por chunks)
        validation: false, // Desactiva validación MD5
      });

      // 4) Verificar que exista localmente y que no sea 0 bytes
      const stats = await fsPromises.stat(destinoLocal).catch(() => null);
      if (!stats || stats.size === 0) {
        throw new Error(`El archivo ${destinoLocal} se descargó con 0 bytes.`);
      }

      // 5) Comparar tamaño local vs tamaño remoto
      if (stats.size !== remoteSize) {
        throw new Error(
          `Tamaños diferentes: local=${stats.size} vs remoto=${remoteSize}. Descarga incompleta.`
        );
      }

      // Si llegamos hasta aquí, la descarga se completó y coincide el tamaño
      console.log(`Descarga completada correctamente en: ${destinoLocal}`);
      return destinoLocal; // Éxito
    } catch (error) {
      console.error(
        `Error al descargar (intento ${attempt + 1} / ${maxRetries}):`,
        error.message
      );

      // (A) Eliminar archivo parcial si existe
      if (fs.existsSync(destinoLocal)) {
        try {
          fs.unlinkSync(destinoLocal);
          console.log(`Archivo parcial ${destinoLocal} eliminado (descarga incompleta).`);
        } catch (unlinkErr) {
          console.warn(`No se pudo eliminar archivo parcial: ${destinoLocal}`);
        }
      }

      // (B) Esperar antes de reintentar, excepto si ya es el último intento
      if (attempt < maxRetries - 1) {
        console.log(`Reintentando en ${retryDelayMs} ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }

    attempt++;
  }

  // Si agotamos todos los intentos
  console.error(`No se pudo descargar ${storagePath} tras ${maxRetries} intentos.`);
  return null;
}

/**
 * Pequeña función de utilidad para "pausar" el flujo durante ms milisegundos.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Función disparadorManual                       (modificada para usar embeddings desde archivo)

async function disparadorManual(usuario, palabraClave, clienteID) {
  console.log('disparadorManual - clienteID recibido:', clienteID);

  try {
    const disparadoresRef = db.ref(`bot_clientes/${usuario}/disparadores`);
    const snapshot = await disparadoresRef.once('value');

    if (!snapshot.exists()) {
      console.log('No existen disparadores configurados para el usuario', usuario);
      return null;
    }

    const disparadores = snapshot.val();
    let mejorCoincidenciaLexica = null;
    let mayorSimilitudLexica = 0;
    let matchedKeywordLexica = null;

    // 1. Intento de coincidencia léxica
    for (let disparadorKey in disparadores) {
      const disparadorData = disparadores[disparadorKey];
      const {
        disparadores: keywordsArray,
        umbral_coincidencia,
        tiempo_espera
      } = disparadorData;

      if (keywordsArray && Array.isArray(keywordsArray)) {
        const umbralCliente = parseFloat(umbral_coincidencia) || 0.5;
        for (let keyword of keywordsArray) {
          const similitud = stringSimilarity.compareTwoStrings(
            keyword.toLowerCase(),
            palabraClave.toLowerCase()
          );

          if (similitud >= umbralCliente && similitud > mayorSimilitudLexica) {
            const ahora = Date.now();
            const tiempoEsperaDefecto = 5;
            const tiempoEsperaMinutos = !isNaN(tiempo_espera) ? parseInt(tiempo_espera) : tiempoEsperaDefecto;
            const tiempoEsperaMs = tiempoEsperaMinutos * 60 * 1000;

            const ultimoUsoRef = db.ref(
              `bot_clientes/${usuario}/clientes/${clienteID}/disparadores_uso/${disparadorKey}/ultimo_uso`
            );
            const ultimoUsoSnapshot = await ultimoUsoRef.once('value');
            const ultimo_uso = ultimoUsoSnapshot.val();

            if (!ultimo_uso || ahora - ultimo_uso >= tiempoEsperaMs) {
              mejorCoincidenciaLexica = { ...disparadorData, disparadorKey};
              mayorSimilitudLexica = similitud;
              matchedKeywordLexica = keyword;
            } else {
              console.log(
                `El disparador con key '${disparadorKey}' está en tiempo de espera para el cliente ${clienteID}.`
              );
            }
          }else{
            console.log('No paso mejorCoinciciaLexica.');
          }
        }
      }
    }

    if (mejorCoincidenciaLexica) {
      // Coincidencia léxica encontrada
      //console.log('URL del video:', mejorCoincidenciaLexica.url_video);
      return await enviarDisparador(usuario, clienteID, mejorCoincidenciaLexica, matchedKeywordLexica);
    }

    // 2. Intento de coincidencia semántica usando las embeddings precargadas
    console.log("No hubo coincidencia léxica. Probando similitud semántica con embeddings (locales)...");
    const userMessageEmbedding = await getEmbedding(palabraClave);
    let mejorCoincidenciaSemantica = null;
    let mayorSimilitudSemantica = 0;
    let matchedKeywordSemantica = null;

    // Usaremos las embeddingsCargados para evitar recalcular
    // embeddingsCargados = [{ disparadorKey, keyword, embedding }, ...]
    for (let disparadorKey in disparadores) {
      const disparadorData = disparadores[disparadorKey];
      const {
        disparadores: keywordsArray,
        umbral_coincidencia,
        tiempo_espera,
        embding,
        url_video
      } = disparadorData || {};

      if (!embding || typeof embding !== 'string' || embding.trim() === "") {
        continue; 
      }

      if (keywordsArray && Array.isArray(keywordsArray)) {
        const umbralCliente = parseFloat(umbral_coincidencia) || 0.5;

        // Filtrar las embeddings que pertenecen a este disparador
        const embeddingsDelDisparador = embeddingsCargados.filter(e => e.disparadorKey === disparadorKey);
        
        for (let e of embeddingsDelDisparador) {
          // e.keyword, e.embedding
          const similitud = cosineSimilarity(userMessageEmbedding, e.embedding);
          if (similitud > mayorSimilitudSemantica && similitud >= umbralCliente) {
            const ahora = Date.now();
            const tiempoEsperaDefecto = 5;
            const tiempoEsperaMinutos = !isNaN(tiempo_espera) ? parseInt(tiempo_espera) : tiempoEsperaDefecto;
            const tiempoEsperaMs = tiempoEsperaMinutos * 60 * 1000;

            const ultimoUsoRef = db.ref(
              `bot_clientes/${usuario}/clientes/${clienteID}/disparadores_uso/${disparadorKey}/ultimo_uso`
            );
            const ultimoUsoSnapshot = await ultimoUsoRef.once('value');
            const ultimo_uso = ultimoUsoSnapshot.val();

            if (!ultimo_uso || ahora - ultimo_uso >= tiempoEsperaMs) {
              mejorCoincidenciaSemantica = { ...disparadorData, disparadorKey, url_video};
              matchedKeywordSemantica = e.keyword;
              mayorSimilitudSemantica = similitud;
            } else {
              console.log(
                `El disparador con key '${disparadorKey}' está en tiempo de espera para el cliente ${clienteID}.`
              );
            }
          }else{
            console.log('No paso mejorCoincidenciaSemantica.');
          }
        }
      }
    }

    if (mejorCoincidenciaSemantica) {
      return await enviarDisparador(usuario, clienteID, mejorCoincidenciaSemantica, matchedKeywordSemantica);
    }

    // 3. Sin coincidencia
    console.log("No se encontró coincidencia léxica ni semántica. Procediendo con el flujo normal.");
    return null;

  } catch (error) {
    console.error('Error al buscar disparador manual:', error);
    return null;
  }
}

// Función auxiliar para enviar el disparador encontrado
async function enviarDisparador(usuario, clienteID, disparadorData, matchedKeyword) {
  const {
    urls,
    storagePath_pdf,
    url_video,
    storagePath_video,
    storagePath_audio,
    pdfs,
    audios,
    nombre_producto,
    empresa,
    disparadorKey,
    tiempo_retraso_envio,
    texto_final 
  } = disparadorData;

  // Tiempo de retraso antes de enviar
  const tiempoRetrasoEnvioDefecto = 3; 
  const tiempoRetrasoEnvioSegundos = !isNaN(tiempo_retraso_envio) ? parseInt(tiempo_retraso_envio) : tiempoRetrasoEnvioDefecto;
  const tiempoRetrasoEnvio = tiempoRetrasoEnvioSegundos * 1000;

  if (tiempoRetrasoEnvio > 0) {
    console.log(`Esperando ${tiempoRetrasoEnvioSegundos} segundos antes de enviar los mensajes del disparador '${disparadorKey}'.`);
    await sleep(tiempoRetrasoEnvio);
  }

  // Añadir palabra clave a disparadores_usados
  const disparadoresUsadosRef = db.ref(
    `bot_clientes/${usuario}/clientes/${clienteID}/disparadores_usados`
  );

  let disparadoresUsadosSnapshot = await disparadoresUsadosRef.once('value');
  let disparadoresUsados = disparadoresUsadosSnapshot.val() || [];

  const palabraClaveNormalizada = matchedKeyword.toLowerCase();
  const disparadoresUsadosNormalizados = disparadoresUsados.map(p => p.toLowerCase());

  if (!disparadoresUsadosNormalizados.includes(palabraClaveNormalizada)) {
    disparadoresUsados.push(matchedKeyword);
    await disparadoresUsadosRef.set(disparadoresUsados);
    console.log(`Palabra clave '${matchedKeyword}' añadida a disparadores_usados.`);
  } else {
    console.log(`Palabra clave '${matchedKeyword}' ya existe en disparadores_usados. No se añade de nuevo.`);
  }

  const directorioBase = path.join('usuarios', usuario, 'disparadores', disparadorKey);
  if (!fs.existsSync(directorioBase)) {
    fs.mkdirSync(directorioBase, { recursive: true });
    console.log(`Directorio creado en enviarDisparador: ${directorioBase}`);
  }

  const mensajes = []; 

  let textoMensaje = '';
  if (nombre_producto) {
    textoMensaje += `*${nombre_producto}*\n`;
  }
  if (empresa) {
    textoMensaje += `${empresa}`;
  }

  let firstMedia = true;

  // 1. GUARDAR PREGUNTA DEL CLIENTE
  const fechaYHoraActualDos = new Date();
  const horaDos = fechaYHoraActualDos.toLocaleString('en-CO', { hour: 'numeric', minute: 'numeric', hour12: true });
  const fechaDos = fechaYHoraActualDos.toLocaleDateString();

  const preguntaCliente = {
    role: "Cliente",
    nombre: "Cliente",
    content: matchedKeyword,   // O la variable donde tengas el texto del usuario
    hora: horaDos,
    fecha: fechaDos
  };
  agregarAlHistorialDeUsuario(clienteID + "base_de_datos", preguntaCliente);

  // Envío de imágenes
  if (urls) {
    for (let index in urls) {
      const { storagePath } = urls[index];
      const { downloadURL } = urls[index];
      if (!storagePath) continue;
  
      const nombreImagen = path.basename(storagePath);
      const rutaImagenLocal = path.join(directorioBase, nombreImagen);
  
      // 4) Si es la primera media, va con el `textoMensaje` 
      if (firstMedia) {
        mensajes.push({
          body: textoMensaje.trim() || ' ',
          media: downloadURL,
        });
        firstMedia = false;
      } else {
        // Siguientes con body vacío
        mensajes.push({
          body: ' ',
          media: downloadURL,
        });
      }
    }
  }

  //------------------------------------------------------
// Envío de video con retries y borrado de descargas fallidas
//------------------------------------------------------

if (storagePath_video) {
  const nombreVideo = path.basename(storagePath_video);
  const rutaVideoLocal = path.join(directorioBase, nombreVideo);

  if (!fs.existsSync(rutaVideoLocal)) {
    console.log(`Video no encontrado localmente. Descargando con .download(): ${storagePath_video}`);
    try {
      const resultado = await descargarArchivoDesdeFirebase(
        storagePath_video,
        rutaVideoLocal, // Ruta local final
        3,              // 3 reintentos
        2000            // 2 segundos de pausa entre reintentos
      );

      if (!resultado) {
        console.warn(`El video no se pudo descargar tras reintentos: ${storagePath_video}`);
        mensajes.push({ body: "Lo sentimos, el video no está disponible en este momento." });
      }
    } catch (error) {
      console.error(`Error general al descargar el video: ${error.message}`);
      mensajes.push({ body: "Ocurrió un problema al descargar el video." });
    }
  }

  // 2) Verificar que realmente exista tras la descarga
  if (!fs.existsSync(rutaVideoLocal)) {
    console.warn(`El video no existe localmente tras la descarga: ${rutaVideoLocal}`);
    mensajes.push({ body: "Lo sentimos, el video no está disponible." });
  } else {
    // 3) Revisar si el archivo está vacío (0 bytes)
    const stats = fs.statSync(rutaVideoLocal);
    if (stats.size === 0) {
      console.warn(`El video '${rutaVideoLocal}' está vacío (0 bytes). Omitiendo envío.`);
      mensajes.push({ body: "Lo sentimos, el video no se pudo enviar. Intenta más tarde." });
    } else {
      // 4) ¡OK! Se agrega al array de mensajes
      if (firstMedia) {
        mensajes.push({
          body: textoMensaje.trim() || ' ',
          media: url_video,
          // mimetype: 'video/mp4', // opcional si lo conoces
        });
        firstMedia = false;
      } else {
        mensajes.push({
          body: ' ',                // un body vacío para “encadenarlo”
          media: url_video,
          // mimetype: 'video/mp4',
        });
      }
    }
  }
}

  // Envío de audio
  //------------------------------------------------------
// Envío de audios con retries y borrado de descargas fallidas
//------------------------------------------------------
if (audios && Array.isArray(audios)) {
  for (const audioObj of audios) {
    const storagePathAudio = audioObj.storagePath;
    if (!storagePathAudio) continue;

    const nombreAudio = path.basename(storagePathAudio);
    const rutaAudioLocal = path.join(directorioBase, nombreAudio);

    // 1) Descarga si NO existe localmente
    if (!fs.existsSync(rutaAudioLocal)) {
      console.log(`Audio no encontrado localmente. Descargando desde: ${storagePathAudio}`);
      try {
        const resultado = await descargarArchivoDesdeFirebase(
          storagePathAudio,
          rutaAudioLocal,
          3,       // maxRetries
          2000     // retryDelayMs
        );
        if (!resultado) {
          console.warn(`El audio no se pudo descargar tras reintentos: ${storagePathAudio}`);
          mensajes.push({ body: "Lo sentimos, el audio no está disponible ahora." });
          continue;
        }
      } catch (error) {
        console.error(`Error general al descargar el audio: ${error.message}`);
        mensajes.push({ body: "Ocurrió un problema al descargar el audio." });
        continue;
      }
    }

    // 2) Revisar si existe tras la descarga
    if (!fs.existsSync(rutaAudioLocal)) {
      console.warn(`El audio no existe localmente tras la descarga: ${rutaAudioLocal}`);
      mensajes.push({ body: "Lo sentimos, el audio no está disponible." });
      continue;
    }

    // 3) Revisar que no sea 0 bytes
    const statsAud = fs.statSync(rutaAudioLocal);
    if (statsAud.size === 0) {
      console.warn(`El audio '${rutaAudioLocal}' está vacío (0 bytes).`);
      mensajes.push({
        body: "Lo sentimos, el audio no se pudo enviar. Intenta más tarde."
      });
      continue;
    }

    // 4) Convertir a OGG (o a lo que necesites) para enviarlo como nota de voz, etc.
    const nombreAudioConvertido = `convertido_${Date.now()}_${Math.floor(Math.random() * 100000)}.ogg`;
    const rutaAudioConvertido = path.join(directorioBase, nombreAudioConvertido);

    if (!fs.existsSync(rutaAudioConvertido)) {
      await convertirAudio(rutaAudioLocal, rutaAudioConvertido);
    }

    // 5) Enviar el primer audio con texto; siguientes sin texto
    if (firstMedia) {
      mensajes.push({
        body: textoMensaje.trim() || ' ',
        media: rutaAudioConvertido,
        options: { sendAudioAsVoice: true },
      });
      firstMedia = false;
    } else {
      mensajes.push({
        body: ' ',
        media: rutaAudioConvertido,
        options: { sendAudioAsVoice: true },
      });
    }
  }
}

    // ========== PDFs (múltiples) ==========
    if (pdfs && Array.isArray(pdfs)) {
      for (const pdfObj of pdfs) {
        const storagePathPdf = pdfObj.storagePath;
        // ... (lo que ya tienes para bajar y enviar PDF)
      }
    }
  
  async function convertirAudio(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('libopus')
        .format('ogg')
        .outputOptions([
          '-vn',
          '-acodec libopus',
          '-b:a 64k',
          '-vbr on',
        ])
        .save(outputPath)
        .on('end', () => {
          console.log(`Archivo de audio convertido y guardado en: ${outputPath}`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`Error al convertir el archivo de audio: ${err.message}`);
          reject(err);
        });
    });
  }

  // Envío de PDF
// Bloque en "enviarDisparador" o donde tengas el envío de PDFs
if (pdfs && Array.isArray(pdfs)) {
  for (const pdfObj of pdfs) {
    const storagePathPdf = pdfObj.storagePath;
    const publicURL = pdfObj.downloadURL;
    if (!storagePathPdf) continue;

    // Nombre local
    const nombrePDF = path.basename(storagePathPdf);
    const rutaPDFLocal = path.join(directorioBase, nombrePDF);

    // Si es el primer "media", mandas el texto
    if (firstMedia) {
      mensajes.push({ body: textoMensaje.trim() || '' });
      firstMedia = false;
    }

    // Envío usando sendFile para no exponer ruta
    const numeroWhatsApp = `${clienteID}@s.whatsapp.net`;
    try {
      await global.providerInstance.sendFile(
        numeroWhatsApp,
        publicURL,
        nombrePDF
      );
      console.log('PDF '+rutaPDFLocal+' storage: '+publicURL+' enviado con éxito a '+numeroWhatsApp);
    } catch (err) {
      console.error(`Error al enviar el PDF '${rutaPDFLocal}': ${err.message}`);
      mensajes.push({ body: "No se pudo enviar el PDF. Disculpa las molestias." });
    }
  }
}

  // Si no se envió ningún medio pero hay texto, enviar sólo el texto
  if (firstMedia && textoMensaje.trim() !== '') {
    mensajes.push({ body: textoMensaje.trim() });
  }

  // Actualizar ultimo_uso
  const ahora = Date.now();
  await db
    .ref(`bot_clientes/${usuario}/clientes/${clienteID}/disparadores_uso/${disparadorKey}`)
    .update({ ultimo_uso: ahora });
    
  // NUEVO: Guardar en el historial local + subir a Firebase
  if (mensajes.length > 0) {
    const fechaYHoraActual = new Date();
    const hora = fechaYHoraActual.toLocaleString('en-CO', { hour: 'numeric', minute: 'numeric', hour12: true });
    const fecha = fechaYHoraActual.toLocaleDateString();

    for (const msg of mensajes) {
      // Si el mensaje tiene texto en 'body'
      if (msg.body && msg.body.trim()) {
        const elemento = {
          role: "Vendedor",         // O el rol que prefieras
          nombre: "Vendedor",       // O el que quieras
          content: msg.body.trim(),
          hora: hora,
          fecha: fecha
        };
        agregarAlHistorialDeUsuario(clienteID + "base_de_datos", elemento);
      }
    }

      // == AÑADIR MENSAJE final si hay 'texto_final' ==
  if (texto_final && typeof texto_final === 'string' && texto_final.trim() !== '') {
    mensajes.push({
      body: texto_final.trim()
    });
  }

    // Una vez guardado en memoria, subimos todo el historial a Firebase
    const finalHistorial = obtenerHistorialDeUsuario(clienteID + "base_de_datos");
    await db.ref(`bot_clientes/${usuario}/clientes/${clienteID}/conversacion`).set(finalHistorial);
  }

  // Retornar el array de mensajes para que el flujo los envíe
  return mensajes.length > 0 ? mensajes : null;

}

// Sección 1: Funciones de configuración

// Sección 2: Funciones de Firebase

function cargarMensajeASoporte(usuario) {
  const ruta = `bot_clientes/${usuario}/a_servidor/configuracion/mensaje_a_soporte`; // Función para cargar el mensaje a soporte desde Firebase
  const mensajeRef = db.ref(ruta);

  mensajeRef.on('value', (snapshot) => {
    if (snapshot.exists()) {
      mensajeASoporte = snapshot.val();
      console.log("Mensaje a soporte cargado:", mensajeASoporte);
    } else {
      console.log("El nodo 'mensaje_a_soporte' no existe o está vacío.");
    }
  }, (error) => {
    console.error("Error al cargar el mensaje a soporte:", error);
  });
}

let activar_sistema = "si"; // Declaración global

function escucharCambios(usuario) {
  const usuariosRef = db.ref('bot_clientes/' + usuario);

  usuariosRef.on('value', (snapshot) => {
    const datosUsuario = snapshot.val();

      // Cargar tiempo de retraso de respuesta desde /a_servidor/configuracion
      if (datosUsuario.a_servidor && datosUsuario.a_servidor.configuracion && datosUsuario.a_servidor.configuracion.tiempo_retraso_respuesta) {
        tiempo_retraso_respuesta = datosUsuario.a_servidor.configuracion.tiempo_retraso_respuesta * 1000; // Convertir a milisegundos
        console.log(`Tiempo de retraso de respuesta cargado: ${tiempo_retraso_respuesta / 1000} segundos`);
      } else {
        tiempo_retraso_respuesta = 5000; // Valor por defecto de 5 segundos
       console.log(`Tiempo de retraso de respuesta no configurado. Usando valor por defecto: ${tiempo_retraso_respuesta / 1000} segundos`);
      }

   /*/ // Verificar si el estado es "desactivado" y cambiarlo a "activo"
    if (datosUsuario && datosUsuario.sistema === "desactivado") {
      usuariosRef.update({ sistema: "si" })
        .then(() => {
          activar_sistema = "si"; // Actualiza la variable global
          //console.log(`El sistema para el usuario ${usuario} estaba desactivado y ha sido reactivado automáticamente.`);
        })
        .catch((error) => {
          console.error("Error al activar el sistema:", error);
        });
      return; // Detener la ejecución adicional para evitar conflictos.
    } */ 
   
    // Verificar y crear la fecha de expiración si no existe
    if (!datosUsuario.hasOwnProperty('fecha_expiracion') || datosUsuario.fecha_expiracion === "") {
      const fechaActual = new Date();
      const fechaExpiracion = new Date(fechaActual);
      fechaExpiracion.setDate(fechaActual.getDate() + 5); // 5 días de prueba

      usuariosRef.update({ fecha_expiracion: fechaExpiracion.toISOString().slice(0, 10) })
        .then(() => {
          console.log(`Fecha de expiración predeterminada asignada: ${fechaExpiracion.toISOString().slice(0, 10)}`);
        })
        .catch((error) => {
          console.error("Error al asignar fecha de expiración predeterminada:", error);
        });

      activar_sistema = "si";
      //console.log(`El sistema para el usuario ${usuario} está activado. Fecha de expiración: ${fechaExpiracion.toISOString().slice(0, 10)}`);
    } else {
      const fechaExpiracion = new Date(datosUsuario.fecha_expiracion);
      const fechaActual = new Date();

      if (fechaActual > fechaExpiracion) {
        activar_sistema = "no"; // Desactiva el bot si la fecha ha expirado
        usuariosRef.update({ sistema: "no" }); // Actualiza el campo 'sistema' en la base de datos
        //console.log(`El sistema para el usuario ${usuario} ha expirado el ${datosUsuario.fecha_expiracion} y se ha desactivado.`);
      } else {
        activar_sistema = "si"; // Activa el bot si la fecha no ha expirado
        //console.log(`El sistema para el usuario ${usuario} está activado. Fecha de expiración: ${fechaExpiracion.toISOString().slice(0, 10)}`);
      }
    }

    // Código adicional para manejar el estado 'desactivado'
    if (datosUsuario.sistema === "desactivado") {
      console.log(`El bot para el usuario ${usuario} está desactivado. Se activará el temporizador para reactivar el bot.`);
      activarTemporizadorReactivacion(usuario, datosUsuario.tiempo_reactivar || 30); // Iniciar el temporizador con el tiempo de reactivación configurado o el valor por defecto de 30 minutos.
    }

    // Verificación y actualización de otros campos
    if (!datosUsuario.hasOwnProperty('sistema') || datosUsuario.sistema === "") {
      usuariosRef.update({ sistema: "si" }, (error) => {
        if (error) {
          console.error("Error al actualizar el campo 'sistema':", error);
        } else {
          console.log("Se agregó el campo 'sistema' con el valor predeterminado.");
        }
      });
    } else {
      activar_sistema = datosUsuario.sistema; // Actualización de activar_sistema
      //console.log("Valor del campo 'sistema':", activar_sistema);
    }

    if (!datosUsuario.hasOwnProperty('api') || datosUsuario.api === "") {
      usuariosRef.update({ api: "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" }, (error) => {
        if (error) {
          console.error("Error al actualizar el campo 'api':", error);
        } else {
          console.log("Se agregó el campo 'api' con el valor predeterminado.");
        }
      });
    } else {
      valor_api = datosUsuario.api;
      //console.log("Valor del campo 'api':", valor_api);
    }

    if (!datosUsuario.hasOwnProperty('organizacion') || datosUsuario.organizacion === "") {
      usuariosRef.update({ organizacion: "org-2jokWsVKJY0QM2LwsGE2dQ33" }, (error) => {
        if (error) {
          console.error("Error al actualizar el campo 'organizacion':", error);
        } else {
          console.log("Se agregó el campo 'organizacion' con el valor predeterminado.");
        }
      });
    } else {
      valor_organizacion = datosUsuario.organizacion;
      //console.log("Valor del campo 'organizacion':", valor_organizacion);
    }

    if (!datosUsuario.hasOwnProperty('modelo') || datosUsuario.modelo === "") {
      usuariosRef.update({ modelo: "gpt-4o-mini" }, (error) => {
        if (error) {
          console.error("Error al actualizar el campo 'modelo':", error);
        } else {
          console.log("Se agregó el campo 'modelo' con el valor predeterminado.");
        }
      });
    } else {
      valor_modelo = datosUsuario.modelo;
      //console.log("Valor del campo 'modelo':", valor_modelo);
    }

    if (!datosUsuario.hasOwnProperty('max_tokens') || datosUsuario.max_tokens === "") {
      usuariosRef.update({ max_tokens: 200 }, (error) => {
        if (error) {
          console.error("Error al actualizar el campo 'max_tokens':", error);
        } else {
          console.log("Se agregó el campo 'max_tokens' con el valor predeterminado.");
        }
      });
    } else {
      max_tokens = datosUsuario.max_tokens;
      //console.log("Valor del campo 'max_tokens':", max_tokens);
    }

    if (!datosUsuario.hasOwnProperty('numero_limite') || datosUsuario.numero_limite === "") {
      usuariosRef.update({ numero_limite: 100 }, (error) => {
        if (error) {
          console.error("Error al actualizar el campo 'numero_limite':", error);
        } else {
          limite_gratuito = 100;
          console.log("Se agregó el campo 'numero_limite' con el valor predeterminado.");
        }
      });
    } else {
      limite_gratuito = datosUsuario.numero_limite;
      //console.log("Valor del campo 'limite':", limite_gratuito);
    }

    if (!datosUsuario.hasOwnProperty('numero_mensajes') || datosUsuario.numero_mensajes === "") {
      usuariosRef.update({ numero_mensajes: 0 }, (error) => {
        if (error) {
          console.error("Error al actualizar el campo 'numero_mensajes':", error);
        } else {
          numero_mensajes = 0;
          console.log("Se agregó el campo 'numero_mensajes' con el valor predeterminado.");
        }
      });
    } else {
      numero_mensajes = datosUsuario.numero_mensajes;
      //console.log("Número de 'mensajes':", numero_mensajes);
      // Verificar y actualizar el estado del sistema
      if (numero_mensajes >= limite_gratuito) {
        activar_sistema = "no";
        console.log("El sistema ha alcanzado el límite de mensajes y ha sido desactivado.");
      } else {
        activar_sistema = "si";
        console.log("El sistema está activado.");
      }
    }

    if (!datosUsuario.hasOwnProperty('tiempo_reactivar') || datosUsuario.tiempo_reactivar === "") {
      usuariosRef.update({ tiempo_reactivar: 30 }, (error) => {
        if (error) {
          console.error("Error al actualizar el campo 'tiempo_reactivar':", error);
        } else {
          console.log("Se agregó el campo 'tiempo_reactivar' con el valor predeterminado.");
        }
      });
    } else {
      tiempo_reactivar = datosUsuario.tiempo_reactivar * 60000;
      console.log("Valor del campo 'tiempo_reactivar':", tiempo_reactivar);
    }

    // Verificar y crear nodo palabras_clave_confirmar si no existe
    if (!datosUsuario.hasOwnProperty('palabras_clave_confirmar')) {
      palabrasClaveConfirmar = ["Asesor", "asesor", "Confirmar", "confirmar", "Ya pague", "ya pague"];
      usuariosRef.update({ palabras_clave_confirmar: palabrasClaveConfirmar }, (error) => {
        if (error) {
          console.error("Error al actualizar el campo 'palabras_clave_confirmar':", error);
        } else {
          console.log("Se agregó el campo 'palabras_clave_confirmar' con el valor predeterminado.");
        }
      });
    }
  }, (errorObject) => {
    console.error("Error al escuchar cambios:", errorObject.code);
  });

  // Listener para el nodo palabras_clave_confirmar
  const palabrasClaveRef = db.ref('bot_clientes/' + usuario + '/palabras_clave_confirmar');
  palabrasClaveRef.on('value', (snapshot) => {
    if (snapshot.exists()) {
      palabrasClaveConfirmar = snapshot.val().filter(item => item);  // Filtrar valores undefined
      console.log("Palabras clave para confirmar actualizadas:", palabrasClaveConfirmar);
    }
  }, (errorObject) => {
    console.error("Error al escuchar cambios en palabras_clave_confirmar:", errorObject.code);
  });
}

// Nueva función para activar el temporizador de reactivación
function activarTemporizadorReactivacion(usuario, tiempoReactivar) {
  const tiempoReactivarMs = tiempoReactivar * 60000; // Convertir minutos a milisegundos

  setTimeout(() => {
    const usuariosRef = db.ref('bot_clientes/' + usuario + "/clientes");
    usuariosRef.once('value', (snapshot) => {
      if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
          const clienteData = childSnapshot.val();
          if (clienteData.estado_chat === "desactivado") {
            console.log(`Reactivando el chat para el usuario ${childSnapshot.key}`);
            usuariosRef.child(childSnapshot.key).update({ estado_chat: "activo" });
          }
        });
      }
    });
  }, tiempoReactivarMs);
}

function asignarPruebaGratis(usuario) {
  const fechaActual = new Date();
  const fechaExpiracion = new Date(fechaActual);
  fechaExpiracion.setDate(fechaActual.getDate() + 5); // Asignar 5 días de prueba

  const usuariosRef = db.ref('bot_clientes/' + usuario);
  usuariosRef.update({
    fecha_expiracion: fechaExpiracion.toISOString().slice(0, 10), // Guardar la fecha en formato ISO
    numero_mensajes: 0, // Inicializar el contador de mensajes
    limite_gratuito: 100 // Asignar el límite de 100 mensajes
  }).then(() => {
    console.log(`Cliente ${usuario} creado con 5 días de prueba y 100 mensajes gratuitos.`);
  }).catch((error) => {
    console.error("Error al asignar prueba gratuita:", error);
  });
}

function actualizarFechaExpiracion(usuario) {
  const nuevaFechaExpiracion = new Date();
  nuevaFechaExpiracion.setMonth(nuevaFechaExpiracion.getMonth() + 1); // Agregar un mes a la fecha actual

  const usuariosRef = db.ref('bot_clientes/' + usuario);
  usuariosRef.update({ fecha_expiracion: nuevaFechaExpiracion.toISOString().slice(0, 10) })
    .then(() => {
      console.log(`Fecha de expiración actualizada para ${usuario}: ${nuevaFechaExpiracion.toISOString().slice(0, 10)}`);
    })
    .catch((error) => {
      console.error("Error al actualizar la fecha de expiración:", error);
    });
}

// Sección 3: Funciones de configuración dinámica
function configuracion_dinamica(usuario) {
  const ruta = 'bot_clientes/' + usuario + '/a_servidor';
  const conectar_firebase = db.ref(ruta).child("configuracion");

  conectar_firebase.on('value', (snapshot) => {
    if (snapshot.exists()) {
      const configuracion = snapshot.val();

      if (configuracion && configuracion.saludo) {
        saludo_plataforma = configuracion.saludo;
      } else {
        console.log('Saludo no encontrado en la configuración');
      }

      if (configuracion && configuracion.icono_agente) {
        icono_agente = configuracion.icono_agente;
      }

      if (configuracion && configuracion.telefono_de_contacto) {
        telefono_notificacion = configuracion.telefono_de_contacto;
      }
    } else {
      console.log('No se encontró el resultado de la base de datos de saludo y despedida');
    }
  });
}

// Sección 4: Funciones de almacenamiento de datos

function guardar_informacion_de_preguntas(usuario) {
  const ruta = 'bot_clientes/' + usuario + '/preguntas_y_respuestas';
  const conectar_firebase = db.ref(ruta);

  conectar_firebase.on('value', (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const datosJSON = JSON.stringify(data, null, 2);
      fs.writeFileSync(`usuarios/${usuario}/preguntas.json`, datosJSON, 'utf-8');
    } else {
      console.log('Error de conexión para crear el catálogo de JSON');
    }
  });
}

function guardar_clientes(usuario) {
  const ruta = 'bot_clientes/' + usuario + '/clientes';
  const conectar_firebase = db.ref(ruta);

  conectar_firebase.on('value', (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const keys = Object.keys(data).filter(key => !data[key].hasOwnProperty('publicidad'));
      const datosJSON = JSON.stringify(keys, null, 2);
      fs.writeFileSync(`usuarios/${usuario}/clientes.json`, datosJSON, 'utf-8');
    } else {
      console.log('Error de conexión para crear el catálogo clientes de JSON');
    }
  });
}

async function crear_promt(usuario) {
  promt_lista = [];
  const ruta = 'bot_clientes/' + usuario + '/preguntas_y_respuestas';
  const rootRef = admin.database().ref(ruta);

  rootRef.on('value', async (productosSnapshot) => {
    try {
      if (productosSnapshot.exists()) {
        promt_lista = [];
        productosSnapshot.forEach((childSnapshot) => {
          const pregunta = childSnapshot.child('pregunta').val();
          const respuesta = childSnapshot.child('respuesta').val();
          const comportamiento = childSnapshot.child('comportamiento').val();

          if (!promt_lista.some((item) => item.prompt === pregunta)) {
            promt_lista.push({ prompt: pregunta, opccompletionion: respuesta, instructions: comportamiento });
          }
        });

        const crear_promt = JSON.stringify(promt_lista, null, 2);
        fs.writeFileSync(`usuarios/${usuario}/promt_nuevo.json`, crear_promt, "utf-8");
        console.log("Datos guardados en promt_nuevo.json");
      } else {
        console.log("No se encontraron datos en la ubicación de preguntas.");
      }
    } catch (error) {
      console.error(error.message);
      throw error;
    }
  });
}

// Sección 5: Historial y GPT
const historialesUsuarios = {};

function crearHistorialParaUsuario(nombreUsuario) {
  historialesUsuarios[nombreUsuario] = [];
}

function agregarAlHistorialDeUsuario(nombreUsuario, elemento) {
  if (!historialesUsuarios[nombreUsuario]) {
    crearHistorialParaUsuario(nombreUsuario);
  }
  historialesUsuarios[nombreUsuario].push(elemento);
}

function obtenerHistorialDeUsuario(nombreUsuario) {
  return historialesUsuarios[nombreUsuario] || [];
}

const historial = [];

// Función para verificar disparadores en la primera interacción
async function verificarDisparadoresPrimeraVez(usuario, mensaje, clienteID, pushName) {
  console.log('Verificando disparadores para cliente:', clienteID);
  
  // Iterar sobre todos los disparadores cargados en memoria
  for (let disparadorKey in disparadoresCargados) {
    const disparador = disparadoresCargados[disparadorKey];
    const keywords = disparador.disparadores || [];
    const umbral = parseFloat(disparador.umbral_coincidencia) || 0.5;

    console.log(`Procesando disparador [${disparadorKey}] con umbral: ${umbral}`);
    
    // Comparar el mensaje con cada palabra clave
    for (let keyword of keywords) {
      const similitud = stringSimilarity.compareTwoStrings(
        keyword.toLowerCase(),
        mensaje.toLowerCase()
      );
      console.log(`Comparando keyword "${keyword}" con mensaje "${mensaje}": Similitud = ${similitud}`);
      
      if (similitud >= umbral) {
        console.log(`Disparador encontrado: ${disparadorKey} con palabra clave: ${keyword}`);
                
        // Registrar al cliente con la etiqueta del disparador
        const datosCliente = {
          fecha: new Date().toISOString().slice(0, 10),
          hora: new Date().toLocaleTimeString(),
          nombre: pushName,
          nombre_sistema: pushName,
          estado_chat: "activo",
          disparador: disparadorKey
        };
        
        await db.ref(`bot_clientes/${usuario}/clientes/${clienteID}`).set(datosCliente);
        
        // Preparar los mensajes a enviar según el disparador
        const mensajes = [];
        let textoMensaje = '';
        if (disparador.nombre_producto) {
          textoMensaje += `*${disparador.nombre_producto}*\n`;
        }
        if (disparador.empresa) {
          textoMensaje += `${disparador.empresa}`;
        }
        
        // Añadir texto al primer mensaje si existe
        if (textoMensaje.trim() !== '') {
          mensajes.push({ body: textoMensaje.trim() });
        }
        
        // Añadir imágenes, videos, audios según el disparador
        if (disparador.urls) {
          for (let urlObj of disparador.urls) {
            mensajes.push({
              body: ' ',
              media: urlObj.storagePath
            });
          }
        }
        
        if (disparador.storagePath_video) {
          mensajes.push({
            body: ' ',
            media: disparador.storagePath_video
          });
        }
        
        if (disparador.storagePath_audio) {
          mensajes.push({
            body: ' ',
            media: disparador.storagePath_audio,
            options: { sendAudioAsVoice: true }
          });
        }
        
        if (disparador.storagePath_pdf) {
          mensajes.push({
            body: ' ',
            media: disparador.storagePath_pdf
          });
        }
        
        return mensajes;
      }
    }
  }
  
  // Si no se encontró ningún disparador
  return null;
}

async function createCompletion(historial, consulta, producto, usuario, clienteID) {
  if (activar_sistema !== "si") {
    console.log("El sistema está desactivado. No se generará respuesta.");
    return "No tengo créditos para darte una respuesta o el límite del plan ha expirado. Escribe la palabra *Asesor* para que pueda atenderte un asesor humano."; //El sistema está desactivado temporalmente debido a alcanzar el límite de mensajes.
  }

  const configuracion = new Configuration({
    organization: valor_organizacion,
    apiKey: valor_api,
  });
  const api = new OpenAIApi(configuracion);

  // Lee el archivo de agente:
const agente_nuevo = await fs.promises.readFile(
  `usuarios/${usuario}/promt_nuevo.json`,
  "utf-8"
);

// Construye un solo “súper prompt” de rol system con:
// (a) las directrices del agente,
// (b) la información del producto,
// (c) las instrucciones de estilo y tono.
const systemPrompt = `
${agente_nuevo}

// ======================
// Información de producto (para que ChatGPT lo tenga en cuenta):
${producto}

// ======================
// Instrucciones de estilo:
// - Adapta respuestas breves y concisas, optimizadas para WhatsApp.
// - Usa palabras clave en negrita, sin añadir o eliminar palabras del contexto.
// - Si el cliente se desvía, dirige sutilmente, resolviendo objeciones de manera discreta.
// - Evita repetir respuestas para mantener la fluidez y el profesionalismo en la conversación.
// - Usa un tono empático utilizando siempre el nombre del usuario y enfocado al objetivo de la empresa.
// - No agregar corchetes, llaves, asteriscos, paréntesis, ni caracteres especiales en los enlaces que envíes.
// - Usa emoticones y saltos de línea para personalizar los mensajes haciéndolos más atractivos para el usuario.

// - Por favor, al final de tu respuesta, incluye la etiqueta de intención en este formato:
// - [INTENCION] = "telefono", "nombre", "celular", "cedula", "dni", "correo", "direccion",
                   "departamento", "provincia","ciudad", "pais", "salario", dedicacion",
                   "empresa", "tienda", "ubicacion", "horario", "contacto", "humano", "asesor",
                   "promocion", "descuento", "oferta","consulta", "pedido", "compra", "producto",
                   "servicio", "medidas", "cantidad", "modelo", "precio", "pago", "detalle", "informacion",
                   "descripcion", "reclamos", "garantia", "ayuda", "devolucion", "quejas", "stock",
                   "fecha", "reunion", "cita", "prestamos", "nomina", "monto", "valor", "objetivo", "industria"
`;

// Ahora, “messages” se compone así:
const messages = [
  { role: "system", content: systemPrompt },
  ...historial,
  { role: "user", content: consulta },
];

let respuestaCompleta = "";

try {
  // 2) Obtener datos del usuario para max_tokens, etc.
  const usuariosRef = db.ref("bot_clientes/" + usuario);
  const snapshot = await usuariosRef.once("value");
  const datosUsuario = snapshot.val();
  const maxTokens = datosUsuario?.max_tokens || 200;

  // 3) Llamada a la API de OpenAI
  const response = await api.createChatCompletion({
    model: valor_modelo,
    messages,
    max_tokens: maxTokens,
    temperature: 0.1,
    frequency_penalty: 1,
    presence_penalty: 1,
  });

  // Verificar que exista contenido
  if (
    response.data.choices &&
    response.data.choices[0] &&
    response.data.choices[0].message &&
    response.data.choices[0].message.content
  ) {
    // a) Copiamos la respuesta textual a "respuestaCompleta"
    respuestaCompleta = response.data.choices[0].message.content;

    // b) Actualizar contador de mensajes si aplica
    if (datosUsuario && typeof datosUsuario.numero_mensajes === "number") {
      let numeroMensajes = datosUsuario.numero_mensajes + 1;
      await usuariosRef.update({ numero_mensajes: numeroMensajes });
      if (numeroMensajes >= limite_gratuito) {
        activar_sistema = "no";
        console.log("Límite de mensajes alcanzado, sistema desactivado.");
      }
    }

    // ============== PARSEAR LA INTENCIÓN ==============
    const regex = /\[INTENCION\]\s*=\s*(.+)/i;
    const match = respuestaCompleta.match(regex);
    if (match && match[1]) {
      const intencionDetectada = match[1].trim();
      console.log(">>>> Intención detectada:", intencionDetectada);

      // c) Verificar si ya existe esa intención en la DB
      const intencionesRef = db.ref(
        `bot_clientes/${usuario}/clientes/${clienteID}/intenciones`
      );

      //  i) Leemos las intenciones guardadas
      const intencionesSnap = await intencionesRef.once("value");
      const intencionesData = intencionesSnap.val() || {};

      //  ii) Convertimos a array de "intencion"
      //      (por si guardamos con .push(), tenemos un objeto con keys)
      const intencionesArray = Object.values(intencionesData).map(
        (item) => item.intencion
      );

      //  iii) Verificamos si la intención ya está
      const yaExiste = intencionesArray.includes(intencionDetectada);
      if (!yaExiste) {
        // d) Guardar la intención si no existe
        await intencionesRef.push({
          intencion: intencionDetectada,
          timestamp: Date.now(),
        });
        console.log("Intención guardada con éxito:", intencionDetectada);
      } else {
        console.log("La intención ya existe, no se guarda de nuevo.");
      }

      // e) Borrar la parte "[INTENCION] = ..." del mensaje final
      respuestaCompleta = respuestaCompleta.replace(regex, "").trim();
    }
    // ============== FIN PARSEAR INTENCION ==============

    // f) Retornar la respuesta *ya limpia* (sin "[INTENCION]")
    return respuestaCompleta;
  } else {
    // Si no hay contenido devuelto por la API
    return "No tengo créditos para darte una respuesta o el límite del plan ha expirado. Escribe la palabra *Asesor* para que pueda atenderte un asesor humano.";
  }
} catch (error) {
  console.error("Error al generar la respuesta:", error);
  return "No tengo créditos para darte una respuesta o el límite del plan ha expirado. Escribe la palabra *Asesor* para que pueda atenderte un asesor humano.";
}
}

// Sección 6: Funciones adicionales


// Sección 7: Flujos de mensajes

const flujo_nuevo = addKeyword(['dapinga']).addAction({ capture: true }, async (ctx, { flowDynamic, state, gotoFlow }) => {
    return gotoFlow(ropa);
});

const ropa = addKeyword([]).addAction(async (ctx, { provider, flowDynamic, gotoFlow, endFlow }) => {
      try {
        console.log(`=== Inicio del flujo 'ropa' === | Mensaje de ${ctx.from}: "${ctx.body}" | Usuario: ${ctx.pushName}`);

        // 1. Verificar estado del sistema
        console.log("Verificando el estado del sistema...");
        const sistemaRef = db.ref(`bot_clientes/${usuario_dinamico}/sistema`);
        const sistemaSnapshot = await sistemaRef.once('value');
        const sistemaEstado = sistemaSnapshot.val();
        console.log(`Estado del sistema: ${sistemaEstado}`);
  
        if (sistemaEstado !== "si"){
            console.log("El sistema apagado. Terminando.")
            endFlow();
            return 
        } 
  
        // 2. Verificar si es un cliente nuevo
        console.log("Verificando si el cliente es nuevo...");
        const clientesRef = db.ref('bot_clientes/' + usuario_dinamico + '/clientes');
        const snapshot = await clientesRef.child(ctx.from).once('value');
  
        if (!snapshot.exists()) {
          console.log(`Cliente nuevo detectado: ${ctx.from}. Iniciando registro...`);
        
          // **1. Registrar al cliente en Firebase**
          const fechaYHoraActual = new Date();
          const fechaNumerica = fechaYHoraActual.getTime();
        
          const datosFechaHora = {
            fecha: fechaYHoraActual.toISOString().slice(0, 10),
            hora: fechaYHoraActual.toLocaleTimeString(),
            nombre: ctx.pushName,
            nombre_sistema: ctx.pushName,
          };
        
          const datosFechaHora_dos = {
            fecha_numero: Math.floor(fechaNumerica / 1000),
            hora: fechaYHoraActual.toLocaleTimeString(),
            nombre: ctx.pushName,
            nombre_sistema: ctx.pushName,
            estado_chat: "activo",
          };
        
          console.log("Registrando datos del cliente en Firebase:", datosFechaHora_dos);
          await clientesRef.child(ctx.from).update(datosFechaHora_dos);
          await clientesRef.child(ctx.from).child("registro").update(datosFechaHora);
        
          console.log("Cliente registrado exitosamente en Firebase.");
        
          // **2. Crear historial para el cliente**
          crearHistorialParaUsuario(ctx.from + "base_de_datos");
          console.log(`Historial creado para el cliente: ${ctx.from}`);
        
          const agregar_uno = { role: "user", content: ctx.body };
          agregarAlHistorialDeUsuario(ctx.from + "base_de_datos", agregar_uno);
        
          // **3. Verificar disparadores**
          console.log("Verificando disparadores para el mensaje:", ctx.body);
          const mensajesDisparador = await disparadorManual(usuario_dinamico, ctx.body, ctx.from);
        
          if (mensajesDisparador) {
            console.log("Disparador encontrado. Enviando respuesta personalizada.");
            console.log("Mensajes a enviar por disparador:", mensajesDisparador);
            await flowDynamic(mensajesDisparador);
            console.log("Respuesta personalizada enviada. Terminando flujo.");
            return endFlow(); // Termina el flujo después de enviar mensajes del disparador
          }
        
          // **4. Continuar con el flujo normal si no hay disparador**
          console.log("No se encontró ningún disparador. Procediendo con el flujo normal.");
        
          // Obtener el mensaje de bienvenida y su estado de activación desde Firebase
          const bienvenidaRef = db.ref(`bot_clientes/${usuario_dinamico}/a_servidor`);
          const [bienvenidaSnapshotNuevo] = await Promise.all([
            bienvenidaRef.child('Bienvenida').once('value'),
          ]); 
                  
          const mensajeBienvenidaNuevo = bienvenidaSnapshotNuevo.val() || '';

          console.log('Enviando mensaje al nuevo cliente:', mensajeBienvenidaNuevo, ' al numero: ', ctx.from); 
          await flowDynamic([{ body: mensajeBienvenidaNuevo }]);
          console.log("Mensaje Bienvenida enviado exitosamente.");
        }
        

        // 5. Cliente existente
        console.log("Cliente existente. Verificando estado del chat...");
        const data_usuarios = snapshot.val();
        let usuario_activar_chat = data_usuarios.estado_chat;
        console.log(`Estado del chat para el usuario ${ctx.from}: ${usuario_activar_chat}`);
  
        if (usuario_activar_chat !== "activo") return console.log(`Chat desactivado usuario ${ctx.from}. No se tomará ninguna acción.`), endFlow();
  
        let tipo_de_envio = "nada";
        let text = ctx.body;
        let id_cliente = ctx.from + "@s.whatsapp.net";
        console.log(`Enviando indicador de escritura a ${id_cliente}...`);
        await provider.sendTypingIndicator(id_cliente);
        
        // 6. Obtener el clienteID para disparador manual
        const clienteID = ctx.from; // Número de teléfono del cliente
        console.log('clienteID:', clienteID); // Para verificar que esté definido

        // 8. Manejo de mensajes multimedia
        if (ctx.message && ctx.message.imageMessage && ctx.message.imageMessage.mimetype) {
          tipo_de_envio = ctx.message.imageMessage.mimetype;
  
          const snapshotImage = await db.ref('bot_clientes/' + usuario_dinamico + '/clientes').child(ctx.from).once('value');
          if (snapshotImage.exists()) {
            const data_usuarios_image = snapshotImage.val();
            console.log(`Estado del chat para el usuario ${ctx.from}: ${data_usuarios_image.estado_chat}`);
            if (data_usuarios_image.estado_chat !== "activo") {
              console.log(`Chat desactivado para el usuario ${ctx.from}. No se tomará ninguna acción.`);
              return endFlow();
            }
          }
  
          console.log("Enviando mensaje de que no se pueden leer imágenes.");
          flowDynamic("👀 Revisaremos la imagen para darle confirmación y nos pondremos en contacto.");
          text = "Escribe la palabra *Asesor* para priorizar tu solicitud. 👨🏻‍💻";
        }
  
        if (ctx.message && ctx.message.audioMessage && ctx.message.audioMessage.mimetype) {
          tipo_de_envio = ctx.message.audioMessage.mimetype;
  
          const snapshotAudio = await db.ref('bot_clientes/' + usuario_dinamico + '/clientes').child(ctx.from).once('value');
          if (snapshotAudio.exists()) {
            const data_usuarios_audio = snapshotAudio.val();
            console.log(`Estado del chat para el usuario ${ctx.from}: ${data_usuarios_audio.estado_chat}`);
            if (data_usuarios_audio.estado_chat !== "activo") {
              console.log(`Chat desactivado para el usuario ${ctx.from}. No se tomará ninguna acción.`);
              return endFlow();
            }
          }
        }
  
        // 1. Verificar si es un audio y convertirlo a texto:
        if (tipo_de_envio === "audio/ogg; codecs=opus") {
          console.log("🤖 Voz a texto....");
          const texto_audio = await handlerAI(ctx);
          console.log(`🤖 Fin voz a texto....[TEXT]: ${texto_audio}`);

          // Reemplazar el contenido original con el texto reconocido:
          text = texto_audio;
        }

        // 2. *Primero* pasarlo a disparadoresManual:
        console.log("Verificando disparadores manuales (texto ya sea de audio o tipado)...");
        const disparador = await disparadorManual(usuario_dinamico, text, clienteID);

        if (disparador && disparador.length > 0) {
          console.log("Disparador manual encontrado. Enviando mensajes correspondientes.");
          await flowDynamic(disparador); 
          console.log("Mensajes de disparador manual enviados. Terminando flujo.");
          return endFlow(); 
        }

        

        // 3. Si *no* coincide con disparadores manuales, sigue la lógica habitual:
        console.log("Sin disparador manual. Continuando con el flujo normal...");
        // Aquí sigues con tu manejo normal de “catálogo”, “menú”, GPT, etc.
       
  
        const fechaYHoraActual_dos = new Date();
        const hora_dos = fechaYHoraActual_dos.toLocaleString('en-CO', { hora: 'numeric', minute: 'numeric', hour12: true });
        const fecha_dos = fechaYHoraActual_dos.toLocaleDateString().slice(0, 10);
        const agregar_dos = { role: "Cliente", nombre: ctx.pushName, content: text, hora: hora_dos, fecha: fecha_dos };
        agregarAlHistorialDeUsuario(ctx.from + "base_de_datos", agregar_dos);
        const obtener_historial_dos = obtenerHistorialDeUsuario(ctx.from + "base_de_datos");
  
        await db.ref('bot_clientes/' + usuario_dinamico + "/clientes").child(ctx.from).child("conversacion").set(obtener_historial_dos);
  
        const agregar_uno = { role: "user", content: text };
        agregarAlHistorialDeUsuario(ctx.from, agregar_uno);
  
        if (text.length >= 400) {
          flowDynamic("Por favor coloca una pregunta más corta para poder entender bien.");
          return gotoFlow(flujo_nuevo);
        }
        
        const telefono = ctx.from;
        const responder_gpt = "si";
        const message = ctx;
  
        historial.push({ role: "user", content: text });
  
        const fechaYHoraActual = new Date();
        const hora = fechaYHoraActual.toLocaleString('en-CO', { hour: 'numeric', minute: 'numeric', hour12: true });
        const fecha = fechaYHoraActual.toLocaleDateString().slice(0, 10);
  
        const consulta = text;
        const contenidoArchivo = fs.readFileSync(`usuarios/${usuario_dinamico}/productos.json`, "utf-8");
        const informacionProducto = JSON.parse(contenidoArchivo);

        
  
        // 9. Verificación de coincidencias para confirmar códigos
        const mejoresCoincidencias_confirmar = stringSimilarity.findBestMatch(text, palabrasClaveConfirmar);
        const similitudMaxima_confirmar = mejoresCoincidencias_confirmar.bestMatch.rating;
        const umbralMinimo_confirmar = 1;
        if (similitudMaxima_confirmar >= umbralMinimo_confirmar) {
          const fechaYHoraActual_confirmar = new Date();
          const fechaNumerica = fechaYHoraActual_confirmar.getTime();
          const hora_confirmar = fechaYHoraActual_confirmar.toLocaleString('en-CO', { hour: 'numeric', minute: 'numeric', hour12: true });
          const estado = "esperando";
  
          const datosFechaHora_confirmar = {
            fecha_numero: Math.floor(fechaNumerica / 1000),
            fecha: fechaYHoraActual_confirmar.toISOString().slice(0, 10),
            hora: hora_confirmar,
            estado: estado
          };
  
          console.log("Actualizando estado del pedido en Firebase...");
          await db.ref("pedidos").child(telefono).update(datosFechaHora_confirmar);
  
          const agregar_variable = { estado_chat: "desactivado" };
          console.log("Desactivando chat para el usuario.");
          await db.ref('bot_clientes/' + usuario_dinamico + "/clientes").child(telefono).update(agregar_variable);
          activar_chat = "desactivado"; 
  
          console.log("Enviando mensaje de soporte al cliente.");
          flowDynamic(mensajeASoporte); 
  
          let numero_envio = telefono_notificacion;
          let texto_mensaje = `👤 Este prospecto requiere de un *Asesor humano* para procesar una *solicitud* en el siguiente WhatsApp.📲\n\n👉 +${ctx.from}\n\nPuedes llamarlo o escribirle.`;
          console.log(`Enviando notificación a ${numero_envio}@s.whatsapp.net: "${texto_mensaje}"`);
          provider.sendMessage(numero_envio + '@s.whatsapp.net', texto_mensaje, 'bot');
  
          return gotoFlow(flujo_nuevo);
        }

        
        // 11. Verificación de coincidencias en categorías de disparadores

        // 12. Verificación de palabras clave para catálogo y menú
        
        const palabrasClave = ["Catalogo", "Catálogo"];
        const mejoresCoincidencias = stringSimilarity.findBestMatch(text, palabrasClave);
        const similitudMaxima = mejoresCoincidencias.bestMatch.rating;
        const umbralMinimo = 1;
  
        if (similitudMaxima >= umbralMinimo) {
          const agregar = { role: "Vendedor", nombre: "Vendedor", content: 'Con gusto ya te envío el catálogo', hora: hora, fecha: fecha };
          agregarAlHistorialDeUsuario(telefono + "base_de_datos", agregar);
          const obtener_historial = obtenerHistorialDeUsuario(telefono + "base_de_datos");

          await db.ref('bot_clientes/' + usuario_dinamico + "/clientes").child(telefono).child("conversacion").set(obtener_historial);
  
          const mensajeInicial = saludo_plataforma;
          const icono = '❇️';
  
          let mensajeCompleto = `${mensajeInicial}\n\n`;
          // categoria_disparadores.forEach((categoria, index) => {
          //   mensajeCompleto += `*${getEmojiFromNumber(index + 1)}* ${categoria}\n`;
          // });
  
          const mensajeFinal = `${fraseCatalogo}`; 
          console.log("Enviando menú de catálogo al cliente.");
          flowDynamic(mensajeCompleto + mensajeFinal);
  
          return gotoFlow(flujo_nuevo);
        }
  
        // 13. Verificación de códigos de producto
  
        // 14. Manejo de archivos interesados
        const archivo = `./interesados/${ctx.from}.json`;
  
        console.log(`Verificando existencia del archivo: ${archivo}`);
  
        if (fs.existsSync(archivo)) {
          console.log("Archivo encontrado. Leyendo datos de productos...");
          const llamar_productos = fs.readFileSync(archivo, "utf-8");
          const leer_productos = JSON.parse(llamar_productos);
  
          if (leer_productos.length > 200) {
            const data = [];
            const datosJSON = JSON.stringify(data, null, 2);
            fs.writeFileSync(`./interesados/${telefono}.json`, datosJSON, "utf-8");
            flowDynamic("Por favor, si deseas realizar tu pedido o consultar, no consultes más de 200 productos a la vez.");
            return gotoFlow(flujo_nuevo);
          }
        } else {
          console.log("El archivo no existe. Creando nuevo archivo vacío.");
          const data = [];
          const datosJSON = JSON.stringify(data, null, 2);
          fs.writeFileSync(archivo, datosJSON, "utf-8");
        }

        
        processingWithChatGPT(telefono, text, archivo, usuario_dinamico, ctx, flowDynamic, hora, fecha, gotoFlow, flujo_nuevo)
  
        // // 15. Manejo de historial y generación de respuesta con GPT
        // console.log("Obteniendo historial de conversación del cliente.");
        // const obtener_historial_del_cliente = obtenerHistorialDeUsuario(telefono);
        // let pasar_historial = obtener_historial_del_cliente;
        // if (pasar_historial.length >= 30) {
        //   console.log("Historial de conversación excede el límite (30). Reduciendo a los últimos 10 mensajes.");
        //   const ultimosDosElementos = pasar_historial.slice(-10);
        //   pasar_historial = ultimosDosElementos;
        // }
  
        // // Crear la respuesta usando ChatGPT
        // console.log("TEXT: "+text);
        // console.log("FROM: "+ctx.from);
        // const mensaje = await createCompletion(pasar_historial, text, archivo, usuario_dinamico, ctx.from);
        // console.log(`Respuesta generada: "${mensaje}"`);
        
        // // **Implementar el retraso antes de enviar la respuesta**
        // console.log(`Esperando ${tiempo_retraso_respuesta} ms antes de enviar la respuesta.`);
        // //await sleep(tiempo_retraso_respuesta);
        
        // console.log("Enviando respuesta al cliente.");
        // flowDynamic(mensaje);
  
        // const agregar_mensaje = { role: "system", content: mensaje };
        // agregarAlHistorialDeUsuario(ctx.from, agregar_mensaje);
  
        // const agregar = { role: "Vendedor", nombre: "Vendedor", content: mensaje, hora: hora, fecha: fecha };
        // agregarAlHistorialDeUsuario(telefono + "base_de_datos", agregar);
        // const obtener_historial = obtenerHistorialDeUsuario(telefono + "base_de_datos");
        // console.log("Actualizando historial de conversación en Firebase.");
        // await db.ref('bot_clientes/' + usuario_dinamico + "/clientes").child(telefono).child("conversacion").set(obtener_historial);
  
        // console.log("Terminando flujo y redirigiendo a 'flujo_nuevo'.");
        // return gotoFlow(flujo_nuevo);
      } catch (error) {
        console.log("El sistema está apagado. No se tomará ninguna acción.", error);
        return endFlow(); // Termina el flujo si el sistema está apagado
      }
    }
);

let activar_chat = "activo";

function actiar_chat(telefono) {
  const usuariosRef = db.ref('bot_clientes/' + usuario_dinamico);
  usuariosRef.once('value', (snapshot) => {
    const datosUsuario = snapshot.val();
    const tiempoReactivar = (datosUsuario.tiempo_reactivar || 30) * 60000;

    setTimeout(() => {
      const agregar_variable = { estado_chat: "activo" };
      db.ref('bot_clientes/' + usuario_dinamico + "/clientes").child(telefono).update(agregar_variable);
      activar_chat = "activo";
    }, tiempoReactivar);
  });
}

// Modificar la función de envío de publicidad
async function enviarPublicidad(usuario, publicidadId, adapterProvider) {
  try {
    // Obtener detalles de la publicidad
    const publicidadRef = db.ref(`bot_clientes/${usuario}/publicidades/${publicidadId}`);
    const publicidadSnapshot = await publicidadRef.once('value');
    const publicidadData = publicidadSnapshot.val();

    if (!publicidadData) {
      console.log(`No se encontró la publicidad ${publicidadId}`);
      return;
    }

    // Verificar el estado de la publicidad
    if (publicidadData.estado !== "enviando") {
      console.log(`Publicidad ${publicidadId} no está en estado de envío`);
      return;
    }

    console.log(`Iniciando envío de publicidad ${publicidadId}`);

    // Obtener la lista de clientes
    const clientesRef = db.ref(`bot_clientes/${usuario}/clientes`);
    const clientesSnapshot = await clientesRef.once('value');
    const clientes = clientesSnapshot.val();

    let clientesEnviados = 0;
    const etiquetasPublicidad = publicidadData.etiquetas || [];

    // Si hay imagen, descargarla una sola vez
    let imageBuffer = null;
    if (publicidadData.imagenURL) {
      try {
        const response = await axios.get(publicidadData.imagenURL, { responseType: 'arraybuffer' });
        imageBuffer = Buffer.from(response.data);
        console.log(`Imagen descargada y almacenada en buffer para la publicidad ${publicidadId}`);
      } catch (error) {
        console.error('Error al descargar imagen:', error);
        return;
      }
    }

    // Procesar cada cliente
    for (const [clienteId, clienteData] of Object.entries(clientes)) {
      try {
        const disparadoresUsados = clienteData.disparadores_usados || [];
        const tieneCoincidencia = etiquetasPublicidad.some(etiqueta =>
          disparadoresUsados.includes(etiqueta)
        );

        if (tieneCoincidencia) {
          const mensaje = `*${publicidadData.titulo}*\n\n${publicidadData.descripcion}`;
          const id = `${clienteId}@s.whatsapp.net`;

          try {
            // Crear una copia del buffer para cada envío
            let messageOptions;
            if (imageBuffer) {
              messageOptions = {
                image: Buffer.from(imageBuffer), // Crear una nueva copia del buffer
                caption: mensaje
              };
            } else {
              messageOptions = {
                text: mensaje
              };
            }

            // Enviar el mensaje
            await adapterProvider.vendor.sendMessage(id, messageOptions);

            // Registrar envío exitoso
            await db.ref(`bot_clientes/${usuario}/clientes/${clienteId}/publicidades_recibidas/${publicidadId}`).set({
              fechaEnvio: Date.now(),
              estado: "enviada"
            });

            clientesEnviados++;
            console.log(`✅ Publicidad enviada a ${clienteId}`);

            // Esperar entre envíos
            await new Promise(resolve => setTimeout(resolve, 30000));
          } catch (error) {
            //console.error(`❌ Error al enviar a ${clienteId}:`, error.message);
            continue;
          }
        }
      } catch (error) {
        console.error(`Error procesando cliente ${clienteId}:`, error.message);
        continue;
      }
    }

    // Actualizar estado al finalizar
    await publicidadRef.update({
      estado: "pendiente",
      totalClientes: clientesEnviados,
      ultimoEnvio: Date.now()
    });

    console.log(`Publicidad ${publicidadId} completada. Envíos exitosos: ${clientesEnviados}`);

  } catch (error) {
    console.error('Error en enviarPublicidad:', error.message);
    await publicidadRef.update({ estado: "pendiente" });
  }
}

// Modificar la función monitorearPublicidades
function monitorearPublicidades(usuario, adapterProvider) {
  const publicidadesRef = db.ref(`bot_clientes/${usuario}/publicidades`);
  
  // Mantener registro de las publicidades que ya se están procesando
  const publicidadesEnProceso = new Set();
  
  // Remover listeners existentes antes de agregar nuevos
  publicidadesRef.off();
  
  publicidadesRef.on('child_changed', async (snapshot) => {
    const publicidadData = snapshot.val();
    const publicidadId = snapshot.key;
    
    if (publicidadData.estado === "enviando" && !publicidadesEnProceso.has(publicidadId)) {
      publicidadesEnProceso.add(publicidadId);
      console.log(`Iniciando envío de publicidad ${publicidadId}`);
      
      try {
        await enviarPublicidad(usuario, publicidadId, adapterProvider);
      } finally {
        publicidadesEnProceso.delete(publicidadId);
      }
    }
  });

  publicidadesRef.on('child_added', async (snapshot) => {
    const publicidadData = snapshot.val();
    const publicidadId = snapshot.key;
    
    if (publicidadData.estado === "enviando" && !publicidadesEnProceso.has(publicidadId)) {
      publicidadesEnProceso.add(publicidadId);
      console.log(`Nueva publicidad detectada ${publicidadId}`);
      
      try {
        await enviarPublicidad(usuario, publicidadId, adapterProvider);
      } finally {
        publicidadesEnProceso.delete(publicidadId);
      }
    }
  });
}

const silencio = addKeyword(['xxxxxxxx'])
  .addAction(async (ctx, { provider, flowDynamic, gotoFlow, fallBack, endFlow }) => {
    console.log("detenido el ", ctx.from);
});

//Crea el interesado en JSON Inicial
function initializeClientFile(numeroDeTelefono) {
  const datosJSON = JSON.stringify([], null, 2);
  fs.writeFileSync(`./interesados/${numeroDeTelefono}.json`, datosJSON, "utf-8");
}

// Función para obtener el estado del sistema
async function obtenerEstadoSistema(usuario) {
  const sistemaRef = db.ref(`bot_clientes/${usuario}/sistema`);
  const snapshot = await sistemaRef.once("value");
  return snapshot.val();
}

// Sección 8: Función principalm
const main_dos = async (user_id) => {
  cargarMensajeASoporte(user_id); // Cargar mensaje a soporte para el usuario

  const adapterDB = new FirebaseAdapter({db});
  const adapterFlow = createFlow([
    ropa
  ]);
  
  const fs = require('fs');
  let enviar_publicidad = "no";
  let titulo = "";
  let texto = "";
  let url_foto = "no";

  // Sección 9: Envio publicidad

  function enviarMensaje(numero, usuario, keywords, adapterProvider) {
    if (enviar_publicidad == "activa") {
        const clientesRef = db.ref('bot_clientes/' + usuario + "/clientes");

        clientesRef.child(numero).once('value', (snapshot) => {
            if (snapshot.exists()) {
                // Verificar si el cliente ya recibió la publicidad
                const yaRecibida = snapshot.child('publicidad').val();
                if (yaRecibida == null) {
                    // Obtener las palabras clave del cliente
                    const disparadoresUsados = snapshot.child('disparadores_usados').val() || [];

                    // Comprobar si hay al menos una coincidencia
                    const coincidencia = keywords.some(keyword => disparadoresUsados.includes(keyword));
                    
                    if (coincidencia) {
                        console.log('Enviando publicidad al :', numero);

                        if (url_foto == "no") {
                            adapterProvider.sendMessage(
                                numero + '@s.whatsapp.net',
                                texto, 'bot');
                        } else {
                            adapterProvider.sendMedia(
                                numero + '@s.whatsapp.net',
                                url_foto,
                                texto
                            );
                        }

                        // Marcar como enviada para evitar múltiples envíos
                        const agregar_variable = { publicidad: "Enviada" };
                        db.ref('bot_clientes/' + usuario + "/clientes").child(numero).update(agregar_variable);
                    } else {
                        console.log('No hay coincidencias de disparadores para el número', numero);
                    }
                } else {
                    console.log('El número', numero, 'ya tiene publicidad, no se le envía de nuevo');
                }
            } else {
                console.log('El número', numero, 'no está registrado en la base de datos de clientes.');
            }
        });
    }
  }

  function enviarMensajesConIntervalo(usuario, adapterProvider) {
      if (enviar_publicidad == "activa") {
          // Obtener las palabras clave configuradas en "Bot Promoción"
          const publicidadRef = db.ref('bot_clientes/' + usuario + "/publicidad/Bot promociòn");
          publicidadRef.child('keywords').once('value', (snapshot) => {
              const keywords = snapshot.val() || [];

              fs.readFile('usuarios/' + usuario + "/clientes.json", 'utf8', (err, data) => {
                  if (err) {
                      console.error('Error al leer el archivo clientes.json:', err);
                      return;
                  }

                  try {
                      const numerosTelefonos = JSON.parse(data);
                      let indice = 0;
                      const intervalo = setInterval(() => {
                          if (indice < numerosTelefonos.length) {
                              const numero = numerosTelefonos[indice];
                              const clientesRef = db.ref('bot_clientes/' + usuario + "/clientes");
                              clientesRef.child(numero).child('publicidad').once('value', (snapshot) => {
                                  if (!snapshot.exists()) {
                                      enviarMensaje(numero, usuario, keywords, adapterProvider);
                                  } else {
                                      console.log('El número', numero, 'ya tiene el campo "publicidad". Saltando al siguiente.');
                                  }
                              });
                              indice++;
                          } else {
                              clearInterval(intervalo);
                          }
                      }, 30 * 1000);
                  } catch (error) {
                      console.error('Error al analizar el contenido de clientes.json:', error);
                  }
              });
          });
      }
  }

  function estado_publicidad(usuario, adapterProvider) {
      const conectar_firebase = db.ref('bot_clientes/' + usuario + "/publicidad");
      conectar_firebase.on('value', (snapshot) => {
          try {
              if (snapshot.exists()) {
                  const data = snapshot.val();
                  const publicidadData = data['Bot promociòn'];

                  if (publicidadData) {
                      const estado = publicidadData.estado;
                      titulo = `*${publicidadData.titulo}*`;
                      texto = `${titulo}\n${publicidadData.texto}`;
                      url_foto = publicidadData.url_imagen;
                      masiva = estado;
                      enviar_publicidad = estado;

                      if (masiva == "activa") {
                          enviarMensajesConIntervalo(usuario, adapterProvider);
                      }
                      console.log("Estado de la publicidad 'Bot promociòn':", masiva);
                  } else {
                      console.log('No se encontraron datos para la publicidad "Bot promociòn".');
                  }
              } else {
                  console.log('No se encontraron datos en el nodo "publicidad".');
              }
          } catch (error) {
              console.error('Error al obtener el estado de la publicidad:', error.message);
          }
      });
  }

  fs.readFile('clientes_bot.json', 'utf8', (err, data) => {
    if (err) {
      console.error('Error al leer el archivo clientes.json:', err);
      return;
    }

    try {
      const conectar_firebase = db.ref('bot_clientes');
      const numeroCliente = user_id;
      conectar_firebase.child(numeroCliente).once('value', async (snapshot) => {
        if (snapshot.exists()) {
          const numero = snapshot.key;
          const adapterProvider = createProvider(BaileysProvider, { name: numero });

          monitorearPublicidades(user_id, adapterProvider);
          

          global.providerInstance = adapterProvider;

          createBot({
            flow: adapterFlow,
            provider: adapterProvider,
            database: adapterDB,
          });

          const permiso = require('fs');
          const nombreCarpeta = `usuarios/${user_id}`;
          if (!permiso.existsSync(nombreCarpeta)) {
            permiso.mkdirSync(nombreCarpeta);
            console.log('Carpeta creada exitosamente:', nombreCarpeta);
          } else {
            console.log('La carpeta ya existe:', nombreCarpeta);
          }

          global.usuario_dinamico = user_id;
          escucharCambios(usuario_dinamico);
          configuracion_dinamica(usuario_dinamico);
          guardar_informacion_de_preguntas(usuario_dinamico);
          guardar_clientes(usuario_dinamico);
          
          crear_promt(usuario_dinamico);
          estado_publicidad(usuario_dinamico, adapterProvider);

          // Cargar disparadores y generar embeddings
          await cargarDisparadores(usuario_dinamico);

          escucharCambiosDisparadores(usuario_dinamico); // Después de cargarDisparadores

          module.exports = {
            admin,
            db,
            usuario_dinamico,
            st
          };
        }
      });
    } catch (error) {
      console.error('Error al analizar el contenido de clientes.json:', error);
    }
  });
};

module.exports = main_dos;

async function processingWithChatGPT(telefono, text, archivo, usuario_dinamico, ctx, flowDynamic, hora, fecha, gotoFlow, flujo_nuevo) {
  console.log("Obteniendo historial de conversación del cliente.");
  const obtener_historial_del_cliente = obtenerHistorialDeUsuario(telefono);
  let pasar_historial = obtener_historial_del_cliente;
  if (pasar_historial.length >= 30) {
    console.log("Historial de conversación excede el límite (30). Reduciendo a los últimos 10 mensajes.");
    const ultimosDosElementos = pasar_historial.slice(-10);
    pasar_historial = ultimosDosElementos;
  }

  // Crear la respuesta usando ChatGPT
  console.log("TEXT: "+text);
  console.log("FROM: "+ctx.from);
  const mensaje = await createCompletion(pasar_historial, text, archivo, usuario_dinamico, ctx.from);
  console.log(`Respuesta generada: "${mensaje}"`);
  
  // **Implementar el retraso antes de enviar la respuesta**
  console.log(`Esperando ${tiempo_retraso_respuesta} ms antes de enviar la respuesta.`);
  //await sleep(tiempo_retraso_respuesta);
  
  console.log("Enviando respuesta al cliente.");
  flowDynamic(mensaje);

  const agregar_mensaje = { role: "system", content: mensaje };
  agregarAlHistorialDeUsuario(ctx.from, agregar_mensaje);

  const agregar = { role: "Vendedor", nombre: "Vendedor", content: mensaje, hora: hora, fecha: fecha };
  agregarAlHistorialDeUsuario(telefono + "base_de_datos", agregar);
  const obtener_historial = obtenerHistorialDeUsuario(telefono + "base_de_datos");
  console.log("Actualizando historial de conversación en Firebase.");
  await db.ref('bot_clientes/' + usuario_dinamico + "/clientes").child(telefono).child("conversacion").set(obtener_historial);

  console.log("Terminando flujo y redirigiendo a 'flujo_nuevo'.");
  return gotoFlow(flujo_nuevo);
}

const args = process.argv.slice(2);
const usuarioNuevo = args.find(arg => arg.startsWith('--usuario_nuevo=')).split('=')[1];

// Iniciar el proceso de carga de usuarios y generación de configuración
main_dos(usuarioNuevo);