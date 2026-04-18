const https = require('https');
const fs = require('fs');

const icons = {
  'blender': 'blender',
  'photoshop': 'adobephotoshop',
  'premiere': 'adobepremierepro',
  'aftereffects': 'adobeaftereffects',
  'unreal': 'unrealengine',
  'n8n': 'n8n'
};

fs.mkdirSync('public/assets/icons', { recursive: true });

Object.entries(icons).forEach(([name, cdnName]) => {
  https.get(`https://cdn.simpleicons.org/${cdnName}/white`, res => {
    res.pipe(fs.createWriteStream(`public/assets/icons/${name}.svg`));
  });
});
