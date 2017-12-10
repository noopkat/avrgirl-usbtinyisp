const AVRGirlTinyUSBISP = require('../avrgirl-usbtinyisp');
const chips = require('avrgirl-chips-json');
const async = require('async');

const expectedSignature = chips.atmega328p.sig;
const expectedSignatureBuffer = Buffer.from(expectedSignature)

let avrgirl = new AVRGirlTinyUSBISP({
  debug: true,
  chip: chips.atmega328p,
  programmer: 'sparkfun-pocket-avr'
});

const checkSig = (error, actualSignature) => {
  if(error){
    console.error('Recieved error checking signature: ', error);
    process.exit(1);
  }
  if(expectedSignatureBuffer.equals(Buffer.from(actualSignature))){
    console.log('Hooray! Your chip signature matches!');
  } else {
    console.error(`Expected: ${expectedSignature} got: ${actualSignature}, check wiring or that you are using the right chip`);
  }
};

avrgirl.on('ready', () => {
  async.series([
    avrgirl.enterProgrammingMode.bind(avrgirl),
    avrgirl.getChipSignature.bind(avrgirl, checkSig)
  ]);
});
