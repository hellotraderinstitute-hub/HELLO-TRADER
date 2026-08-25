const fs = require('fs');
const glob = require('path');

const targetFiles = [
  '/var/www/hello-trader/src/app/globals.css',
  '/var/www/hello-trader/public/reel1_video_player.html'
];

targetFiles.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/&#x27;\/grid\.svg&#x27;/g, '/grid.svg');
    content = content.replace(/grid\.svg/g, 'grid_pattern');
    fs.writeFileSync(file, content, 'utf8');
    console.log('SANCP_CLEANED:', file);
  }
});
