module.exports = { apps: [
  {
    "name": "Prueba-5",
    "script": "app.js",
    "args": "--usuario_nuevo=Prueba-5",
    "env": {
      "API_KEY": "api-openai-de-la-cuenta-del-usuario-final",
      "ORGANIZACION": "org-openai-del-usuario"
    },
    "instances": 1,
    "exec_mode": "fork"
  },
  {
    "name": "Prueba-61",
    "script": "app.js",
    "args": "--usuario_nuevo=Prueba-61",
    "env": {
      "API_KEY": "api-openai-de-la-cuenta-del-usuario-final",
      "ORGANIZACION": "org-openai-del-usuario"
    },
    "instances": 1,
    "exec_mode": "fork"
  }
] };