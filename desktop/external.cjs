const contact=require('./contact.json');
const destinations=new Set([contact.website,contact.feedback,contact.coffee,'mailto:'+contact.email]);
module.exports.allowedExternal=url=>typeof url==='string'&&destinations.has(url);
