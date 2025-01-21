require("dotenv").config();
const axios = require('axios');

const uuid = require('uuid');

const {
  createBot,
  createProvider,
  createFlow,
  addKeyword,

 
  EVENTS,
} = require("@bot-whatsapp/bot");




const { init } = require("bot-ws-plugin-openai");
const BaileysProvider = require("@bot-whatsapp/provider/baileys");
const MockAdapter = require("@bot-whatsapp/database/mock");
const { handlerAI } = require("./utils");
const { textToVoice } = require("./services/eventlab");

const stringSimilarity = require("string-similarity");


const automatico="no";

//const { OpenAIApi } = require('openai');

const { Configuration, OpenAIApi } = require("openai");
const fs = require("fs");
const { convertOggMp3 } = require("./services/convert");


const admin=require('firebase-admin');

var serviceAccount = require("./latinospublicidad-477b3-firebase-adminsdk-eymq0-e12331392d.json");
const { off } = require("process");
const { privateDecrypt } = require("crypto");
admin.initializeApp({

  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://mady-3d18e-default-rtdb.firebaseio.com/',
  storageBucket: 'gs://mady-3d18e.appspot.com'

})

const db = admin.database();
const st=admin.storage().bucket();






let detener;



if (detener) {
    console.log('Deteniendo el bot...');
    // Realizar acciones para detener el bot
}




let saludo_plataforma = "";
let icono_agente="👨‍💼";
//let usuario_dinamico='';

let arrancado="";

function configuracion_dinamica(usuario) {
  ruta='bot_clientes/'+usuario+'/a_servidor'
  const conectar_firebase = db.ref(ruta).child("configuracion");

  conectar_firebase.on('value', (snapshot) => {
    if (snapshot.exists()) {
      const configuracion = snapshot.val();

      if (configuracion && configuracion.saludo) {
        const saludo = configuracion.saludo;
        saludo_plataforma = saludo;
       
      } else {
        console.log('Saludo no encontrado en la configuración');
      }

      if (configuracion && configuracion.icono_agente) {
        const icono = configuracion.icono_agente;
      
       
      } 
    } else {
      console.log('No se encontró el resultado de la base de datos de saludo y despedida');
    }
  });
}

// Ejecutar la función cuando se inicia el script
//configuracion_dinamica();



async function guardar_jeison(usuario) {
  const ruta = 'bot_clientes/' + usuario + '/productos';
  const conectar_firebase = admin.database().ref(ruta);

  conectar_firebase.on('value', async (snapshot) => {
    try {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const datosJSON = JSON.stringify(data, null, 2);




       
        
        fs.writeFileSync(`usuarios/${usuario}/productos.json`, datosJSON, "utf-8");
       
        guardarJeisonCodigos(usuario);
      } else {
      
        throw new Error("Los datos no existen en Firebase");
      }
    } catch (error) {
      console.error(error.message);
    }
  });
}








function guardar_informacion_de_preguntas(usuario) {
  ruta='bot_clientes/'+usuario+'/preguntas_y_respuestas'
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
  ruta='bot_clientes/'+usuario+'/clientes'
  const conectar_firebase = db.ref(ruta);

  conectar_firebase.on('value', (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const keys = Object.keys(data).filter(key => !data[key].hasOwnProperty('publicidad')); // Filtrar las claves que no tienen el campo "publicidad"
      const datosJSON = JSON.stringify(keys, null, 2);
      
      fs.writeFileSync(`usuarios/${usuario}/clientes.json`, datosJSON, 'utf-8');
     
    } else {
      console.log('Error de conexión para crear el catálogo clientes de JSON');
    }
  });
}







let imagenes_catalogo = [];
let imagenes_pijamas= [];
let imagenes_ropa_de_vestir = [];
let codigos = []; // Declara el array fuera de la función
let codigos_dos = [];

let categorias_lista = [];

let categoria_disparadores = [];


async function guardarJeisonCodigos(usuario) {

  imagenes_catalogo = [];
  imagenes_pijamas= [];
  imagenes_ropa_de_vestir = [];
  codigos = []; // Declara el array fuera de la función
  codigos_dos = [];

  //nuevas opciones
  categorias_lista = [];
  categoria_disparadores = [];



  const imagenesPorCategoria = {};

  ruta='bot_clientes/'+usuario+'/productos'
  const rootRef = admin.database().ref(ruta);

  try {
    const productosSnapshot = await rootRef.once('value');
    if (productosSnapshot.exists()) {
      productosSnapshot.forEach((childSnapshot) => {
        const codigo = childSnapshot.child('codigo').val();
        const url = childSnapshot.child('url').val();
        const categoria=childSnapshot.child('categoria').val();

        const categorias_opciones=childSnapshot.child('categoria').val();

          categorias_lista.push({ categoria: categorias_opciones, opcion: categorias_opciones});

          if (!categoria_disparadores.includes(categorias_opciones)) {
            categoria_disparadores.push(categorias_opciones);
          } 
      
        if (codigo!== null) {
          codigos.push(codigo);
          //categoria_disparadores.push(categorias_opciones);

          codigos_dos.push({ pregunta: codigo, respuesta: codigo });
         
        }
       
        if (url!== null) { 
          imagenes_catalogo.push({ imageUrl: url});
       }

       if (categoria !== null && url !== null) {
        if (!imagenesPorCategoria[categoria]) {
          imagenesPorCategoria[categoria] = [];
        }
        imagenesPorCategoria[categoria].push({ imageUrl: url });
      }
     
      
      });

     
      const outputFolderBase =  `./usuarios/${usuario}`; 

      for (const categoria in imagenesPorCategoria) {
        const categoriaFolder = `${outputFolderBase}/${categoria}`;
        if (!fs.existsSync(categoriaFolder)) {
          fs.mkdirSync(categoriaFolder);
        }
        
        const imagenesCategoria = imagenesPorCategoria[categoria];
        downloadImagesFromUrls(imagenesCategoria, categoriaFolder,categoria)
          .catch((err) => {
            console.error(`Error al descargar imágenes para ${categoria}:`, err);
          });
      }
     

      const disparador_categorias_sistena = JSON.stringify(categoria_disparadores, null, 2);
      fs.writeFileSync( `usuarios/${usuario}/categorias_disparadores.json`, disparador_categorias_sistena, "utf-8");
    
      const datos_categorias = JSON.stringify(categorias_lista, null, 2);
      fs.writeFileSync(`usuarios/${usuario}/categorias.json`, datos_categorias, "utf-8");

      
      const datosJSON = JSON.stringify(codigos, null, 2);
      fs.writeFileSync(`usuarios/${usuario}/codigos.json`, datosJSON, "utf-8");
   
      const datos_disparadores = JSON.stringify(codigos_dos, null, 2);
      fs.writeFileSync(`usuarios/${usuario}/codigos_disparadores.json`, datos_disparadores, "utf-8");

      
      console.log("Datos guardados en codigos.json");


    } else {
      console.log("No se encontraron datos en la ubicación de productos.");
    }
  } catch (error) {
    console.error(error.message);
    throw error;
  }
}


async function crear_promt(usuario) {
  promt_lista = [];
  ruta='bot_clientes/'+usuario+'/preguntas_y_respuestas'
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


const historialesUsuarios = {};

function crearHistorialParaUsuario(nombreUsuario) {
  historialesUsuarios[nombreUsuario] = [];
}

function agregarAlHistorialDeUsuario(nombreUsuario, elemento) {
  if (!historialesUsuarios[nombreUsuario]) {
    // Si el historial para este usuario no existe, crear uno nuevo
    crearHistorialParaUsuario(nombreUsuario);
  }
  historialesUsuarios[nombreUsuario].push(elemento);
}


// Función para obtener el historial de un usuario
function obtenerHistorialDeUsuario(nombreUsuario) {
  return historialesUsuarios[nombreUsuario] || [];
}

// Lee el contenido del archivo de texto
const agente = fs.readFileSync("agente.json", "utf-8");





const configuracion = new Configuration({
  organization: "org-2jokWsVKJY0QM2LwsGE2dQ33",
  apiKey: "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",
});
const api = new OpenAIApi(configuracion);



const historial_base_de_Datos = [];

const historial = [];

const imagenesAEnviar = [];
imagenesAEnviar.push({
  body: "Descripción de la primera imagen",
  media: "https://firebasestorage.googleapis.com/v0/b/privalia-7955b.appspot.com/o/uno.jpg?alt=media&token=ea55e700-f827-497a-9750-cc19373f6eb4&_gl=1*tddzkf*_ga*MzUzNzI2OTEyLjE2ODk4OTI0MDM.*_ga_CW55HF8NVT*MTY5NjQ5MTM0NC40OC4xLjE2OTY0OTE5NzYuNDQuMC4w"
});
imagenesAEnviar.push({
  body: "Descripción de la segunda imagen",
  media: "https://firebasestorage.googleapis.com/v0/b/privalia-7955b.appspot.com/o/ropa%20de%20vestir%2F325963885_1259819847905166_2681067450242897605_n.jpg?alt=media&token=d28c3a10-bab2-4898-a18a-19a21b9e4876&_gl=1*1ojomxp*_ga*MzUzNzI2OTEyLjE2ODk4OTI0MDM.*_ga_CW55HF8NVT*MTY5NzAwNDMxNC41Ny4xLjE2OTcwMDQ5NDEuNTcuMC4w"
});



async function createCompletion(historial,consulta,producto,usuario) {
  
  
  const agente_nuevo = fs.readFileSync(`usuarios/${usuario}/promt_nuevo.json`, "utf-8");
  const messages = historial.concat([
    {
      role: "system",
      content: agente_nuevo, 
    },
    {
      role: "system",
      content: agente, 
    },
    
   {
     role: "system",
     content: producto, 
    },
   
    
    { role: "user", content: consulta+"  Inicia con una introducción clara del propósito del mensaje; usa respuestras detalladas y concisas entre 60 y 400 caracteres; Consulta todos los sistemas de roles para ofrecer la mejor respuesta; Utiliza saltos de línea, palabras en negrita y emojis para que el mensaje sea más atractivo al cliente." },
  ]);



  try {
    const response = await api.createChatCompletion({
      model: "gpt-3.5-turbo-0125",
      messages,
      max_tokens: 200,
      temperature: 0.1,
      frequency_penalty: 1,
      presence_penalty: 1,
    });

    if (response.data.choices && response.data.choices[0] && response.data.choices[0].message && response.data.choices[0].message.content) {
      return response.data.choices[0].message.content;
    } else {
      // No se pudo obtener una respuesta válida
      return "por favor pregunta de nuevo";
    }
  } catch (error) {
    // Manejo de errores
    console.error("Error al generar una respuesta:", error);
    return "por favor pregunta de nuevo";
  }
}




const employeesAddonConfig = {
  model: "gpt-4-1106-preview",
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
};
const employeesAddon = init(employeesAddonConfig);

//sistema para comprimir pdf










//sistema para convertir imagenes a pdf.


async function createPdfWithImages(imagePaths, outputPath) {
  const { PDFDocument, rgb } = require('pdf-lib');
const fs_dos = require('fs').promises;
  // Crear un nuevo documento PDF
  const pdfDoc = await PDFDocument.create();
  
  for (const imagePath of imagePaths) {
    // Leer la imagen desde el archivo
    const imageBytes = await fs_dos.readFile(imagePath);
    
    // Crear una nueva página para cada imagen con el mismo tamaño que la imagen
    const embeddedImage = await pdfDoc.embedJpg(imageBytes);
    const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
    
    // Agregar la imagen completa a la página
    const imageOptions = {
      x: 0,
      y: 0,
      width: embeddedImage.width,
      height: embeddedImage.height,
    };
    page.drawImage(embeddedImage, imageOptions);
  }

  // Guardar el PDF en un archivo
  const pdfBytes = await pdfDoc.save();

  await fs_dos.writeFile(outputPath, pdfBytes);

  
 
  

  
}











//sistema para descargar imagen
async function downloadImagesFromUrls(imageUrls, outputFolder,categoria) {
  
  const axios_nuevo = require('axios');
  const fs_nuevo = require('fs').promises;
  let downloadedCount = 0;
  const imagePaths = []; 
  for (let i = 0; i < imageUrls.length; i++) {
   
    
    const imageUrl = imageUrls[i].imageUrl; // Obtiene la URL de la imagen
    const outputPath = `${outputFolder}/imagen_${i}.jpg`;
    imagePaths.push(outputPath);

    try {
      const response = await axios_nuevo.get(imageUrl, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(response.data);

      await fs_nuevo.writeFile(outputPath, imageBuffer);
      downloadedCount++; 
      //console.log(`Imagen ${i + 1} descargada y guardada en ${outputPath}`);
      
      if (downloadedCount === imageUrls.length) {
        // Todas las imágenes han sido descargadas
       // console.log('Todas las imágenes han sido descargadas.');
        const outputPath = `${outputFolder}/${categoria}_catalogo.pdf`;
       // console.log("SE ACTUALIZO EL SISTEMA");
        actualizar_sitema="finalizado";

        createPdfWithImages(imagePaths, outputPath)
       .catch((err) => {
        //console.error('Error al crear el PDF con imágenes:', err);
       });

        
      }
      
    } catch (err) {
     // console.error(`Error al descargar la imagen ${i + 1}:`, err);
    }
  }
}



const flujo_nuevo = addKeyword(['dapinga'])
        
        .addAction({ capture: true }, async (ctx, { flowDynamic, state,gotoFlow }) => {
         

          

            return gotoFlow(ropa)
        })
        


const ropa = addKeyword(["p"]).addAction(
   async (ctx,{provider, flowDynamic, gotoFlow,fallBack,endFlow }) => {



      // Referencia al nodo 'clientes' en Firebase
      const clientesRef = db.ref('bot_clientes/'+usuario_dinamico+'/clientes');
    
      // Consulta para verificar si el número existe
      clientesRef.child(ctx.from).once('value', (snapshot) => {
        if (snapshot.exists()) {
          
            if(snapshot.hasChild("estado_chat")){
              const data_usuarios = snapshot.val();
              let usuario_activar_chat=data_usuarios.estado_chat;
    
              if(usuario_activar_chat!="activo"){
                return gotoFlow(flow_consultar_registro);
                
              }

            }

    
        } else {


 // El número de teléfono no existe en la base de datos


 crearHistorialParaUsuario(ctx.from+"base_de_datos");
 const numeroDeTelefono = ctx.from; // Reemplaza esto con el número que deseas consultar



const agregar_uno=({ role: "user", content: ctx.body });

agregarAlHistorialDeUsuario(ctx.from+"base_de_datos",agregar_uno);




  // El número de teléfono no existe en la base de datos
  const fechaYHoraActual = new Date();


const datosFechaHora = {
fecha: fechaYHoraActual.toISOString().slice(0, 10),
hora: fechaYHoraActual.toLocaleTimeString(),
nombre:  ctx.pushName,
nombre_sistema: ctx.pushName
};

const fechaNumerica = fechaYHoraActual.getTime(); // Obtiene la marca de tiempo en milisegundos
const datosFechaHora_dos= {
fecha_numero: Math.floor(fechaNumerica / 1000), // Convierte milisegundos a segundos
hora: fechaYHoraActual.toLocaleTimeString(),
nombre: ctx.pushName,
nombre_sistema: ctx.pushName,
estado_chat: "activo"
};





db.ref('bot_clientes/'+usuario_dinamico+"/clientes").child(ctx.from).update(datosFechaHora_dos)

db.ref('bot_clientes/'+usuario_dinamico+"/clientes").child(ctx.from).child("registro").update(datosFechaHora)





const mensajeInicial = saludo_plataforma;
const icono = '🧢';

 let mensajeCompleto = mensajeInicial + '\n\n';
categoria_disparadores.forEach((categoria, index) => {
  mensajeCompleto += `*${getEmojiFromNumber(index)}* ${categoria}\n`;
});


if(activar_chat=="activo"){
  const mensajeFinal = '\n"🤶 *¿Cual te gustaria ver?*';
   flowDynamic(mensajeCompleto+mensajeFinal);
   
}else{
  return gotoFlow(flow_consultar_registro);
   
  
  
}


        }
      });
    













    if(activar_chat=="activo"){
     
    }else{
     // actiar_chat(ctx.from)
      return gotoFlow(flow_consultar_registro);
    }
    


   let tipo_de_envio="nada";
   let text = ctx.body;
  let id_cliente=ctx.from+"@s.whatsapp.net";
  
  // await provider.sendMessage('573166271079@s.whatsapp.net', `BOT LATINOS: Se confirmo una compra en la Tienda de gorras con el numero de telefono: ${ctx.from}\n\nPor favor revisa la app.`,'sadas')
  //await provider.sendPresenceUpdate("573001223302", "recording")
  await provider.sendTypingIndicator(id_cliente);




 
  






//verifica si hay una foto
  if (ctx.message && ctx.message.imageMessage && ctx.message.imageMessage.mimetype) {
    tipo_de_envio = ctx.message.imageMessage.mimetype;
    flowDynamic("🤖 Nuestro sistema todavía no tiene la capacidad de leer imágenes, pero te dejo el Menu para mas información.");
    text="Menu";
   // return gotoFlow(flujo_nuevo);
} 



      //verifica si hay un audio en el mensaje
    if (ctx.message && ctx.message.audioMessage && ctx.message.audioMessage.mimetype) {
       tipo_de_envio = ctx.message.audioMessage.mimetype;
      
  }

    if(tipo_de_envio=="audio/ogg; codecs=opus"){
      
    
    console.log("🤖 voz a texto....");
     const texto_audio = await handlerAI(ctx);
    console.log(`🤖 Fin voz a texto....[TEXT]: ${texto_audio}`);
    //return fallBack();
    text=texto_audio;
  
    
    }


    const fechaYHoraActual_dos = new Date();
    //agregar historial base de datos
    const hora_dos = fechaYHoraActual_dos.toLocaleString('en-CO', { hora: 'numeric', minute: 'numeric', hour12: true });
 
    const fecha_dos=fechaYHoraActual_dos.toLocaleDateString().slice(0, 10);

    const agregar_dos=({ role: "Cliente",nombre:ctx.pushName, content: text , hora: hora_dos, fecha: fecha_dos})
    agregarAlHistorialDeUsuario(ctx.from+"base_de_datos",agregar_dos);
    const obtener_historial_dos = obtenerHistorialDeUsuario(ctx.from+"base_de_datos");

    db.ref('bot_clientes/'+usuario_dinamico+"/clientes").child(ctx.from).child("conversacion").set(obtener_historial_dos);


   


    const agregar_uno=({ role: "user", content: text });

    agregarAlHistorialDeUsuario(ctx.from,agregar_uno);


















    
    

    if(text.length>=400){
      flowDynamic("Por favor coloca una pregunta mas corta para poder entender bien.")
      return gotoFlow(flujo_nuevo);
    }
    const telefono=ctx.from;
    const responder_gpt="si";
   
    const message = ctx;
      

  
  
  
   //await provider.sendMedia('57316@s.whatsapp.net', 'https://firebasestorage.googleapis.com/v0/b/privalia-7955b.appspot.com/o/Pijamas%2F1000403657.jpg.jpg?alt=media&token=2944524d-f24f-484b-87ea-89acdbda5394&_gl=1*dcvrx9*_ga*MzUzNzI2OTEyLjE2ODk4OTI0MDM.*_ga_CW55HF8NVT*MTY5Nzk2ODc3OS4xMDAuMS4xNjk3OTY4ODc0LjYwLjAuMA..' ,'mensaje de texto');
   //await provider.sendAudio('57316@s.whatsapp.net', 'https://firebasestorage.googleapis.com/v0/b/privalia-7955b.appspot.com/o/audios%2Faudio.mp3?alt=media&token=ed809add-35f8-4378-a747-514fff3f34f2&_gl=1*tp8426*_ga*MzUzNzI2OTEyLjE2ODk4OTI0MDM.*_ga_CW55HF8NVT*MTY5Nzk2ODc3OS4xMDAuMS4xNjk3OTY5NzE2LjM1LjAuMA..')

    historial.push({ role: "user", content: text });


    const fechaYHoraActual = new Date();
    const hora = fechaYHoraActual.toLocaleString('en-CO', { hour: 'numeric', minute: 'numeric', hour12: true });
   
    const fecha=fechaYHoraActual.toLocaleDateString().slice(0, 10);

     
   

    const consulta = text;
    const contenidoArchivo = fs.readFileSync("usuarios/"+usuario_dinamico+"/productos.json", "utf-8");
    const informacionProducto = JSON.parse(contenidoArchivo);



    const palabrasClave_confirmar = ["Confirmar compra", "confirmar compra", "confirmar", "comfirmar mi compra", "Confirmar mi compra", "aceptar compra", "Aceptar compra","Confirmar pedido","Confirmar","Asesor","Hablar con un asesor","asesor","Hablar con el dueño","Hablar con un humano","quiro hablar con alguien","Quiero hablar con alguien","quiero comunicarme","Quiero comunicarme"];
    const mejoresCoincidencias_confirmar = stringSimilarity.findBestMatch(text, palabrasClave_confirmar);
    const similitudMaxima_confirmar = mejoresCoincidencias_confirmar.bestMatch.rating;
    const umbralMinimo_confirmar = 1;
    if(similitudMaxima_confirmar >= umbralMinimo_confirmar){

      
      //si captuta la confirmacion de la compra almacenamos los valores en firebase
      // Obtener la fecha y hora actual
      const fechaYHoraActual = new Date();

      const fechaNumerica = fechaYHoraActual.getTime(); // Obtiene la marca de tiempo en milisegundos

      
      const hora = fechaYHoraActual.toLocaleString('en-CO', { hour: 'numeric', minute: 'numeric', hour12: true });
      const estado = "esperando";
      
      const datosFechaHora = {
        fecha_numero: Math.floor(fechaNumerica / 1000), // Convierte milisegundos a segundos

          fecha: fechaYHoraActual.toISOString().slice(0, 10),
          hora: hora,
          estado: estado
      };


     


      db.ref("pedidos").child(telefono).update(datosFechaHora)
      
      
      const agregar_variable= {
        estado_chat: "desactivado"
      };
      
    
      db.ref('bot_clientes/'+usuario_dinamico+"/clientes").child(telefono).update(agregar_variable)
      actiar_chat(telefono);


      flowDynamic("En breves un operador real atendera este chat");

      let numero_envio="573001223302"
      let texto_mensaje="Se confirmo una compra del numero: "+ctx.from+" Por favor atiende al cliente";
      provider.sendMessage(
        numero_envio+'@s.whatsapp.net', 
       texto_mensaje,'bot');
      
      
 
       return gotoFlow(flujo_nuevo);


    }


    if (!isNaN(text)) {
      const numeroSeleccionado = parseInt(text);
      if (numeroSeleccionado >= 0 && numeroSeleccionado < categoria_disparadores.length) {
          if (categoria_disparadores.length > 0) {
              const categoriaSeleccionada = categoria_disparadores[numeroSeleccionado];
              text=categoriaSeleccionada;
            } else {
              // Aquí puedes manejar el caso cuando el array categoria_disparadores está vacío
          }
      } else {
          // Aquí puedes manejar el caso cuando el número está fuera del rango del 0 al 50
      }
  } else {
      // Aquí puedes continuar con tu lógica actual para otros casos
  }


    const palabrasClave_pijama = categoria_disparadores;
    const mejoresCoincidencias_pijama = stringSimilarity.findBestMatch(text, palabrasClave_pijama);
    const similitudMaxima_pijama = mejoresCoincidencias_pijama.bestMatch.rating;
    const umbralMinimo_pijama = 0.5;
    if(similitudMaxima_pijama >= umbralMinimo_pijama){
      const palabraSimilar = mejoresCoincidencias_pijama.bestMatch.target;
      
      flowDynamic(`Con gusto ya te envio el catálogo de ${palabraSimilar}`);


      const fechaYHoraActual = new Date();
      const hora = fechaYHoraActual.toLocaleString('en-CO', { hour: 'numeric', minute: 'numeric', hour12: true });
     
      const fecha=fechaYHoraActual.toLocaleDateString().slice(0, 10);
  
       
   

      const agregar=({ role: "Vendedor",nombre:"Vendedor", content: `Con gusto ya te envio el catálogo de ${palabraSimilar}` , hora: hora, fecha: fecha});
      agregarAlHistorialDeUsuario(telefono+"base_de_datos",agregar);
      const obtener_historial = obtenerHistorialDeUsuario(telefono+"base_de_datos");

      db.ref('bot_clientes/'+usuario_dinamico+"/clientes").child(telefono).child("conversacion").set(obtener_historial);
  

      const pijamas = Object.keys(informacionProducto)
      .filter(key => informacionProducto[key].categoria === palabraSimilar)
      .map(key => informacionProducto[key]);
  
      const urlsDePijamas = pijamas.map(pijama => ({
        body: `*${pijama.nombre_producto}*\n ${pijama.empresa}\n\nPrecio: *${pijama.precio}* COP`,
        media: pijama.url,
      })).slice(0, 3);

      urlsDePijamas.push({
        body: `🧏 Por favor escucha el audio👇`,
      });




      
      const conectar_firebase = db.ref('bot_clientes/'+usuario_dinamico+'/a_servidor').child("audios").child(palabraSimilar);
      const tempFolderPath = './tmp';

      try {
        const snapshot = await conectar_firebase.once('value');
        let nota_de_vos = "Abajo de este audio te dejo un pdf con todas las imagenes de la categoría";
      
        if (snapshot.exists()) {
          nota_de_vos = snapshot.val();
       
          const path = require('path');
          const fileName = `${palabraSimilar}.mp3`;
          // Ruta completa del archivo de audio
        const filePath = path.join(tempFolderPath, fileName);
        if (fs.existsSync(filePath)) {
         
          // Enviar el archivo de audio existente como respuesta
          urlsDePijamas.push({
            body: `Te envío un audio, por favor escúchalo`,
            media: filePath,
          });
        }else{
          const path = await textToVoice(nota_de_vos, palabraSimilar);
           urlsDePijamas.push({
          body: `Te envie un audio, por favor escúchalo`,
          media: path,
        });

        }
            




        } 
      
        





      } catch (error) {
        console.log('Error:', error);
      }


     
      
     
      let ubicacion_catalogo = "usuarios/"+usuario_dinamico+"/" + palabraSimilar + "/"+palabraSimilar+"_catalogo.pdf";
      urlsDePijamas.push({
        body: `🐶 Te envie un archivo *pdf* con todas las imagenes*`,
        media: ubicacion_catalogo

      });
     

  
      flowDynamic(urlsDePijamas);
      return gotoFlow(flujo_nuevo);

    }

    

 








    //palabra clave para enviar todas las imagenes por el disparador catalogo o similares
    const palabrasClave = ["Catalogo", "Catálogo","Menu","menu"];
    const mejoresCoincidencias = stringSimilarity.findBestMatch(text, palabrasClave);
    const similitudMaxima = mejoresCoincidencias.bestMatch.rating;
    const umbralMinimo = 0.4;

   

      if(similitudMaxima >= umbralMinimo){


        const fechaYHoraActual = new Date();
        const hora = fechaYHoraActual.toLocaleString('en-CO', { hour: 'numeric', minute: 'numeric', hour12: true });
       
        const fecha=fechaYHoraActual.toLocaleDateString().slice(0, 10);
    
        
  
        const agregar=({ role: "Vendedor",nombre:"Vendedor", content: 'Con gusto ya te envio el catálogo' , hora: hora, fecha: fecha});
        agregarAlHistorialDeUsuario(telefono+"base_de_datos",agregar);
        const obtener_historial = obtenerHistorialDeUsuario(telefono+"base_de_datos");
  
        db.ref('bot_clientes/'+usuario_dinamico+"/clientes").child(telefono).child("conversacion").set(obtener_historial);









        const mensajeInicial = saludo_plataforma;
    const icono = '🧢';

     let mensajeCompleto = mensajeInicial + '\n\n';
    categoria_disparadores.forEach((categoria, index) => {
      mensajeCompleto += `*${getEmojiFromNumber(index)}* ${categoria}\n`;
    });


   
    const mensajeFinal = '\n"🤶 *¿Cual te gustaria ver?*';
    flowDynamic(mensajeCompleto+mensajeFinal);




       
       // console.log("listo ya te mando")
       return gotoFlow(flujo_nuevo);
      }//termina el cierre de las palabras clave catalogo
   
    
    const codigoProducto = text; // Código del producto que deseas buscar

// Verifica si el código del producto existe en el archivo JSON



const palabrasClave_confirmar_codigos = codigos;
const mejoresCoincidencias_confirmar_codigos = stringSimilarity.findBestMatch(text, palabrasClave_confirmar_codigos);
const similitudMaxima_confirmar_codigos = mejoresCoincidencias_confirmar_codigos.bestMatch.rating;
const umbralMinimo_confirmar_codigos = 0.8;

if(similitudMaxima_confirmar_codigos >= umbralMinimo_confirmar_codigos){

    flowDynamic('Con gusto ya te envio la imagen del codigo')


    const agregar=({ role: "Vendedor",nombre:"Vendedor", content: 'Con gusto ya te envio la imagen del codigo' , hora: hora, fecha: fecha});
    agregarAlHistorialDeUsuario(telefono+"base_de_datos",agregar);
    const obtener_historial = obtenerHistorialDeUsuario(telefono+"base_de_datos");

    db.ref('bot_clientes/'+usuario_dinamico+"/clientes").child(telefono).child("conversacion").set(obtener_historial);






  const pijamas = Object.keys(informacionProducto)
  .filter(key => informacionProducto[key].codigo === codigoProducto)
  .map(key => informacionProducto[key]);

  const urlsDePijamas = pijamas.map(pijama => ({
    body: `*${pijama.nombre_producto}*\nCódigo: ${pijama.codigo}\nPrecio: *${pijama.precio}* COP`,
    media: pijama.url,
  }));

  flowDynamic(urlsDePijamas);
  return gotoFlow(flujo_nuevo);
}















  // Si el código del producto no existe en el archivo JSON, puedes manejarlo de alguna manera

 


  const archivo = `./interesados/${ctx.from}.json`;

// Verificar si el archivo existe
if (fs.existsSync(archivo)) {
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
  console.log("El archivo no existe.");
  
  // Crear el archivo si no existe
  const data = [];
  const datosJSON = JSON.stringify(data, null, 2);
  
  fs.writeFileSync(archivo, datosJSON, "utf-8");
  
  // Haz lo que sea necesario después de crear el archivo
}



  

    const obtener_historial_del_cliente = obtenerHistorialDeUsuario(telefono);

    
  let pasar_historial=obtener_historial_del_cliente;
    if (pasar_historial.length >= 20) {
      // Obtén los dos últimos elementos del historial
      const ultimosDosElementos = pasar_historial.slice(-10);
     
    pasar_historial=ultimosDosElementos;
      
    } else {
   pasar_historial=pasar_historial;
    }
 
    console.log(pasar_historial);
  //flowDynamic(`${icono_agente} un momento por favor`);
  const mensaje = await createCompletion(pasar_historial,text,archivo,usuario_dinamico);

    flowDynamic(mensaje);

    const agregar_mensaje=({ role: "system", content: mensaje});
      
          agregarAlHistorialDeUsuario(ctx.from,agregar_mensaje);
  

//nueva forma de agregar los datos a la base
    const agregar=({ role: "Vendedor",nombre:"Vendedor", content: mensaje , hora: hora, fecha: fecha});
        agregarAlHistorialDeUsuario(telefono+"base_de_datos",agregar);
        const obtener_historial = obtenerHistorialDeUsuario(telefono+"base_de_datos");

        db.ref('bot_clientes/'+usuario_dinamico+"/clientes").child(telefono).child("conversacion").set(obtener_historial);
  
    

  


        return gotoFlow(flujo_nuevo);
  
  }
  
);











function getEmojiFromNumber(number) {
  switch (number) {
      case 0:
          return '0️⃣';
      case 1:
          return '1️⃣';
      case 2:
          return '2️⃣';
      case 3:
          return '3️⃣';
      case 4:
          return '4️⃣';
      case 5:
          return '5️⃣';
      case 6:
          return '6️⃣';
      case 7:
          return '7️⃣';
      case 8:
          return '8️⃣';
      case 9:
          return '9️⃣';
      case 10:
          return '🔟';
      case 11:
          return '1️⃣1️⃣';
      case 12:
          return '1️⃣2️⃣';
      case 13:
          return '1️⃣3️⃣';
      case 14:
          return '1️⃣4️⃣';
      case 15:
          return '1️⃣5️⃣';
      case 16:
          return '1️⃣6️⃣';
      case 17:
          return '1️⃣7️⃣';
      case 18:
          return '1️⃣8️⃣';
      case 19:
          return '1️⃣9️⃣';
      case 20:
          return '2️⃣0️⃣';
      // Continuar con los demás casos según sea necesario...
      default:
          return number;
  }
}






let activar_chat="activo";



function esperar_conectar(){

      return "nada";

}



function actiar_chat(telefono) {
  setTimeout(() => {
    
    
      const agregar_variable= {
        estado_chat: "activo"
      };
      
    
      db.ref('bot_clientes/'+usuario_dinamico+"/clientes").child(telefono).update(agregar_variable)
      activar_chat="activo";
    
  }, 1200000); //20 minutos
}


function publicidad(telefono,ruta) {
  setTimeout(() => {
    
    
      ruta.sendMedia(telefono+'@s.whatsapp.net', 'https://firebasestorage.googleapis.com/v0/b/latinospublicidad-477b3.appspot.com/o/imagen_negocio.jpg?alt=media&token=5838d22a-9870-4de4-b922-a25460d11cfb' ,'mensaje de texto');

    
  }, 10); //20 minutos
}




const silencio = addKeyword(['xxxxxxxx'])


    
    .addAction(async(ctx,{ provider,flowDynamic, gotoFlow,fallBack,endFlow })=> {
        
        console.log("detenido el ",ctx.from);
        
          
          const mensaje = await esperar_conectar();
          if(mensaje=="nada"){
          
          }
          
        
    })

    


const flow_consultar_registro = addKeyword([EVENTS.WELCOME,EVENTS.VOICE_NOTE,EVENTS.MEDIA]).addAction(
  async (ctx, { provider,flowDynamic, gotoFlow,fallBack,endFlow}) => {

    
    
    
   
   const numeroDeTelefono = ctx.from; // Reemplaza esto con el número que deseas consultar

   
 



   const codigos_dos = [];
   const datosJSON = JSON.stringify(codigos_dos, null, 2);
   fs.writeFileSync(`./interesados/${numeroDeTelefono}.json`, datosJSON, "utf-8");
  
   db.ref('bot_clientes/'+usuario_dinamico+'/clientes').child(numeroDeTelefono).once('value')
   .then(snapshot => {
     if (snapshot.exists()) {

      const data_usuarios = snapshot.val();
      activar_chat=data_usuarios.estado_chat;

      if(activar_chat==null){
        const agregar_variable= {
          estado_chat: "activo"
        };
        
      
        db.ref('bot_clientes/'+usuario_dinamico+"/clientes").child(ctx.from).update(agregar_variable)
        activar_chat="activo";


      }else{
        activar_chat=data_usuarios.estado_chat;
        if(data_usuarios.estado_chat=="desactivado_manual"|| data_usuarios.estado_chat=="desactivado"){
          actiar_chat(ctx.from);
        }
      }
      

      
        const nombre_usuario = data_usuarios.nombre_sistema;
        

       
  

      const mensajeInicial = saludo_plataforma;
      const icono = '🧢';
  
       let mensajeCompleto = mensajeInicial + '\n\n';
      categoria_disparadores.forEach((categoria, index) => {
      mensajeCompleto += `${icono}. ${categoria}\n`;
      });
  
  
     
      const mensajeFinal = '\n"🤶 *¿Cual te gustaria ver?*';

        if(activar_chat=="activo"){
          
        // flowDynamic(mensajeCompleto+mensajeFinal);
          gotoFlow(ropa);
        }else{
          gotoFlow(silencio);
           
          
          
        }

      //ponemos la nueva variable de registro de estado del chat

     

     } else {
       // El número de teléfono no existe en la base de datos


       crearHistorialParaUsuario(ctx.from+"base_de_datos");
       const numeroDeTelefono = ctx.from; // Reemplaza esto con el número que deseas consultar

    
    
    const agregar_uno=({ role: "user", content: ctx.body });

    agregarAlHistorialDeUsuario(ctx.from+"base_de_datos",agregar_uno);













        // El número de teléfono no existe en la base de datos
        const fechaYHoraActual = new Date();

    
    const datosFechaHora = {
      fecha: fechaYHoraActual.toISOString().slice(0, 10),
      hora: fechaYHoraActual.toLocaleTimeString(),
      nombre:  ctx.pushName,
      nombre_sistema: ctx.pushName
    };

    const fechaNumerica = fechaYHoraActual.getTime(); // Obtiene la marca de tiempo en milisegundos
    const datosFechaHora_dos= {
      fecha_numero: Math.floor(fechaNumerica / 1000), // Convierte milisegundos a segundos
      hora: fechaYHoraActual.toLocaleTimeString(),
      nombre: ctx.pushName,
      nombre_sistema: ctx.pushName,
      estado_chat: "activo"
    };
    
   
    
    
    
    db.ref('bot_clientes/'+usuario_dinamico+"/clientes").child(ctx.from).update(datosFechaHora_dos)

      db.ref('bot_clientes/'+usuario_dinamico+"/clientes").child(ctx.from).child("registro").update(datosFechaHora)


      
      






     const mensajeInicial = saludo_plataforma;
      const icono = '🧢';
  
       let mensajeCompleto = mensajeInicial + '\n\n';
      categoria_disparadores.forEach((categoria, index) => {
        mensajeCompleto += `*${getEmojiFromNumber(index)}* ${categoria}\n`;
      });
  
  
      if(activar_chat=="activo"){
        const mensajeFinal = '\n"🤶 *¿Cual te gustaria ver?*';
         flowDynamic(mensajeCompleto+mensajeFinal);
         return fallBack();
      }else{
        gotoFlow(silencio);
         
        
        
      }
     

     }
   })
   .catch(error => {
     //console.error('Error al consultar la base de datos:', error);
   });
 

}
)













const main_dos = async (user_id) => {

  const adapterDB = new MockAdapter();
  const adapterFlow = createFlow([
      flow_consultar_registro,
      ropa,
      silencio,

      flujo_nuevo,
  ]);

  const fs = require('fs');

  let enviar_publicidad = "no";
  let titulo = "";
  let texto = "";
  let url_foto = "no";

  function enviarMensaje(numero, usuario, adapterProvider) {

      if (enviar_publicidad == "activa") {


          // Referencia al nodo 'clientes' en Firebase
          const clientesRef = db.ref('bot_clientes/' + usuario + "/clientes");

          // Consulta para verificar si el número existe
          clientesRef.child(numero).once('value', (snapshot) => {
              if (snapshot.exists()) {
                  const publicidad = snapshot.child('publicidad').val();
                  if (publicidad == null) {
                      // El número existe en la base de datos de clientes

                      console.log('Enviando publicidad al :', numero);
                      // adapterProvider.sendMessage(
                      //  numero+'@s.whatsapp.net', 
                      //  titulo,'bot');


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


                      const agregar_variable = {
                          publicidad: "Enviada"
                      };

                      db.ref('bot_clientes/' + usuario + "/clientes").child(numero).update(agregar_variable)

                  } else {
                      console.log('El número', numero, 'ya tiene publicidad no se le envia de nuevo');

                  }


              } else {
                  console.log('El número', numero, 'no está registrado en la base de datos de clientes.');
              }
          });
      }
  }


  function enviarMensajesConIntervalo(usuario, adapterProvider) {

      if (enviar_publicidad == "activa") {


          // Leer el archivo clientes.json
          fs.readFile('clientes.json', 'utf8', (err, data) => {
              if (err) {
                  console.error('Error al leer el archivo clientes.json:', err);
                  return;
              }

              try {
                  // Convertir el contenido del archivo JSON a un array de números de teléfono
                  const numerosTelefonos = JSON.parse(data);

                  let indice = 0;
                  const intervalo = setInterval(() => {
                      if (indice < numerosTelefonos.length) {
                          const numero = numerosTelefonos[indice];

                          // Referencia al nodo 'clientes' en Firebase
                          const clientesRef = db.ref('bot_clientes/' + usuario + "/clientes");

                          // Consulta para verificar si el número tiene el campo "publicidad"
                          clientesRef.child(numero).child('publicidad').once('value', (snapshot) => {
                              if (snapshot.exists()) {
                                  // El número tiene el campo "publicidad", así que no se envía mensaje
                                  console.log('El número', numero, 'ya tiene el campo "publicidad". Saltando al siguiente.');
                              } else {
                                  // El número no tiene el campo "publicidad", así que se envía el mensaje
                                  enviarMensaje(numero, usuario, adapterProvider);
                              }
                          });

                          indice++;
                      } else {
                          clearInterval(intervalo); // Detener el intervalo cuando se hayan enviado todos los mensajes
                      }
                  }, 20 * 1000); // Intervalo de 1 minuto (en milisegundos)
              } catch (error) {
                  console.error('Error al analizar el contenido de clientes.json:', error);
              }
          });
      }
  }

  // Función para obtener el estado de la publicidad desde Firebase
  function estado_publicidad(usuario, adapterProvider) {
      const conectar_firebase = db.ref('bot_clientes/' + usuario + "/publicidad");

      // Escuchar cambios en el nodo 'publicidad'
      conectar_firebase.on('value', (snapshot) => {
          try {
              if (snapshot.exists()) {
                  const data = snapshot.val();
                  const publicidadData = data['Bot promociòn']; // Acceder a los datos bajo la clave 'Bot promociòn'

                  // Verificar si existen datos para 'Bot promociòn'
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
                      // Aquí puedes hacer lo que necesites con el estado de la publicidad 'Bot promociòn'
                  } else {
                      console.log('No se encontraron datos para la publicidad "Bot promociòn".');
                  }
              } else {
                  console.log('No se encontraron datos en el nodo "publicidad".');
              }
          } catch (error) {
              console.error('Error al obtener el estado de la publicidad:', error.message);
          }

          // Cerrar la conexión después de obtener los datos
          //conectar_firebase.off();
      });
  }

  // Leer el archivo clientes.json
  fs.readFile('clientes_bot.json', 'utf8', (err, data) => {
      if (err) {
          console.error('Error al leer el archivo clientes.json:', err);
          return;
      }

      try {

          const conectar_firebase = db.ref('bot_clientes');
          const numeroCliente = user_id;

          conectar_firebase.child(numeroCliente).once('value', (snapshot) => {
              if (snapshot.exists()) {
                  const numero = snapshot.key; // Obtener el número de teléfono como clave del snapshot

                  const adapterProvider = createProvider(BaileysProvider, {
                      name: numero // Nombre del bot según el número de teléfono del cliente
                  });

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
                  

                  configuracion_dinamica(usuario_dinamico);
                  guardar_jeison(usuario_dinamico);
                  guardar_informacion_de_preguntas(usuario_dinamico);
                  guardar_clientes(usuario_dinamico);
                  guardarJeisonCodigos(usuario_dinamico);
                  crear_promt(usuario_dinamico);
                  estado_publicidad(usuario_dinamico, adapterProvider);

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



const express = require('express');
const app = express();
const path = require('path');
const { exec } = require('child_process');
const bodyParser = require('body-parser');

app.use(express.static(path.join(__dirname, 'pagina')));
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    const userData = main_dos(user_id); // Aquí le pasamos el parámetro 'user_id' a la función main_dos
    res.sendFile(path.join(__dirname, 'pagina', 'login.html'));
});

app.post('/login', (req, res) => {

if(arrancado==""){



  const { username, password } = req.body;

  console.log('Username:', username); 
  console.log('Password:', password); 

  const conectar_firebase = db.ref('bot_clientes/' + username);

  // Escuchar cambios en el nodo 'bot_clientes'
  conectar_firebase.once('value', (snapshot) => {
      try {
          if (snapshot.exists()) {
              const data = snapshot.val();
              const contra = data['clave_ingreso']; // Acceder a los datos bajo la clave 'clave_ingreso'

              // Verificar si existe la contraseña
              if (contra && contra === password) {
                //arrancado="si";
                const userData = main_dos(username);
                  const redirectURL = `https://mady-3d18e.web.app/plataforma.html?pregunta=${username}&otraVariable=${password}`;
                  return res.redirect(redirectURL);
              } else {
                  console.log('La contraseña no coincide');
                  return res.sendFile(path.join(__dirname, 'pagina', 'login.html'));
              }
          } else {
              console.log('El usuario no existe');
              return res.sendFile(path.join(__dirname, 'pagina', 'login.html'));
          }
      } catch (error) {
          console.error('Error al buscar el usuario:', error);
          return res.sendFile(path.join(__dirname, 'pagina', 'login.html'));
      }
  });
}else{
  console.log("el sistema ya esta iniciado");
  return res.sendFile(path.join(__dirname, 'pagina', 'login.html'));
}
});



let server = null;
function iniciarServidor() {
  if (!server) {
      server = app.listen(3000, () => {
          console.log('Server is running on port 3000');
          exec('start http://localhost:3000/login.html');
      });
  } else {
      console.log('El servidor ya está iniciado');
  }
}

iniciarServidor();





