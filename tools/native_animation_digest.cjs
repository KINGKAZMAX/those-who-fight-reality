/* Digest every input that can change atlas validation, not just path strings. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto')
module.exports=function verificationDigest(root,catalogText){
 let catalog;vm.runInNewContext(catalogText,{define(value){catalog=value}})
 const files=new Set(['vendor/F.LF/game/native-animation.js','vendor/F.LF/game/reality-art.js','vendor/F.LF/game/game.js','vendor/LF2_19/data/data.js'])
 for(const object of catalog.objects)for(const sheet of object.sheets)files.add('vendor/LF2_19/'+sheet.source)
 for(const sheet of Object.values(catalog.replacements))files.add('vendor/F.LF/game/art/'+sheet.file)
 for(const patch of catalog.patches||[])files.add('vendor/F.LF/game/art/'+patch.file)
 let data;vm.runInNewContext(fs.readFileSync(path.join(root,'vendor/LF2_19/data/data.js'),'utf8'),{define(value){data=value}})
 for(const object of data.object)files.add('vendor/LF2_19/'+object.file)
 const hash=crypto.createHash('sha256').update('catalog\0').update(catalogText)
 for(const file of [...files].sort())hash.update('\0'+file+'\0').update(fs.readFileSync(path.join(root,file)))
 return hash.digest('hex')
}
