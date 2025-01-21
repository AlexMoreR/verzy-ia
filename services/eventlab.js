const fs = require('node:fs')
/**
 *
 * @param {*} voiceId clone voice ADx6Adeiy0dptJmK2Z6J
 * @returns
 */
const fs_dos = require('fs');
const fetch = require('node-fetch');
const path = require('path');

const textToVoice = async (text, fileName, voiceId = 'cxjgWvu7S3PMBduD2VoY') => {
  const EVENT_TOKEN = process.env.EVENT_TOKEN ?? "";
  const URL = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const header = new Headers();
  header.append("accept", "audio/mpeg");
  header.append("xi-api-key", EVENT_TOKEN);
  header.append("Content-Type", "application/json");

  const raw = JSON.stringify({
    text,
    model_id: "eleven_multilingual_v1",
    voice_settings: {
      stability: 1,
      similarity_boost: 1.0,
    },
  });

  const requestOptions = {
    method: "POST",
    headers: header,
    body: raw,
    redirect: "follow",
  };

 

  const response = await fetch(URL, requestOptions);
  const buffer = await response.arrayBuffer();
  const pathFile = path.join(process.cwd(), 'tmp', `${fileName}.mp3`);
  fs_dos.writeFileSync(pathFile, Buffer.from(buffer));
  
  return pathFile;
};

module.exports = { textToVoice };
