var async = require('async');
var usbtinyisp = require('../avrgirl-usbtinyisp');
var chips = require('avrgirl-chips-json');


var avrgirl = new usbtinyisp({
	debug: true, 
	chip: chips.attiny85, 
	programmer: 'sf-tiny-avr'
});

avrgirl.on('ready', function() {
  // upload a program to flash memory
  async.series([
    avrgirl.enterProgrammingMode.bind(avrgirl),
    avrgirl.writeFlash.bind(avrgirl, 'tests/hex/attiny85Blink.ino.tiny8.hex'),
    avrgirl.exitProgrammingMode.bind(avrgirl)
    ], function (error) {
      console.log('err', error);
      avrgirl.close();
    }
  );
});
