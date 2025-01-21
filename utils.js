const { downloadMediaMessage } = require('@adiwajshing/baileys');
const fs = require('node:fs/promises');
const { convertOggMp3 } = require('./services/convert');
const { voiceToText } = require('./services/whisper');

const handlerAI = async (ctx) => {
  try {
    // Descargar el mensaje de voz
    const buffer = await downloadMediaMessage(ctx, "buffer");
    const pathTmpOgg = `${process.cwd()}/tmp/voice-note-${Date.now()}.ogg`;
    const pathTmpMp3 = `${process.cwd()}/tmp/voice-note-${Date.now()}.mp3`;

    // Guardar el archivo OGG en el sistema
    console.log("Guardando archivo OGG...");
    await fs.writeFile(pathTmpOgg, buffer);

    // Convertir el archivo OGG a MP3
    console.log("Convirtiendo a MP3...");
    await convertOggMp3(pathTmpOgg, pathTmpMp3);

    // Convertir el MP3 a texto
    console.log("Convirtiendo voz a texto...");
    const text = await voiceToText(pathTmpMp3);

    console.log("Texto procesado:", text);
    return text; // El habla convertida a texto

  } catch (error) {
    console.error("Error en el proceso de manejo de la IA:", error);
    throw new Error("Error al procesar la nota de voz");
  }
};

module.exports = { handlerAI };
