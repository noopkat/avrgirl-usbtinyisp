# avrgirl-usbtinyisp


![avrgirl logo](http://i.imgur.com/hFXbPIe.png)

## Installation

`npm install avrgirl-usbtinyisp`

## What is this?

avrgirl-usbtinyisp is a NodeJS implementation to drive USBtinyISP programmers. It facilitates the 2-way communication required to program and read supported Atmel AVR microchips.

Supported devices:

+ SparkFun Pocket Programmer
+ SparkFun Tiny Programmer
+ Adafruit USBtinyISP Programmer
+ Adafruit Trinket
+ Arduino Gemma
+ Adafruit Gemma v2

Current feature implementation of avrgirl-usbtinyisp:

+ Enter / leave programming mode
+ Read programmer/chip signatures
+ Write to EEPROM and Flash memory
+ Read from EEPROM and Flash memory
+ Erase chip memory

## What would I use this for?

Let's say you'd like to use NodeJS to flash and erase microchips. This could be an integrated circuit with an embedded AVR microchip. For example, you could flash a precompiled program to the chip with an USBtinyISP compatible programmer, such as a [SparkFun Pocket Programmer](https://www.sparkfun.com/products/9825).


## Before you start

### Providing options

avrgirl-usbtinyisp needs some input from you when instantiating. This is because we don't know which chip you would like to flash yet, and other details.

The options needed have the following signature:

```javascript
var options = {
	debug: [boolean],
	chip: [object], 
	programmer: [string]
};
```

Confused? Let's have a look at each one.

**options.debug**

Turn on debug logging in the console. Provides status messages when running methods.

**options.programmer**

Which USBtinyISP programmer is being used? String values for supported programmers defined below:

+ SparkFun Pocket Programmer: `sf-pocker-avr`
+ SparkFun Tiny Programmer: `sf-tiny-avr`
+ Adafruit USBtinyISP Programmer: `adafruit-avr`
+ Adafruit Trinket: `trinket`
+ Arduino Gemma: `gemma`
+ Adafruit Gemma v2: `gemma2`

**options.chip**

The chip property is an object that follows a strict format / signature. It specifies the configuration properties of the microchip you are using.  You'll need to know and supply this configuration. You can find this from AVR Studio, the [avrgirl-chips-json package](https://www.npmjs.com/package/avrgirl-chips-json), or use the [AVRDUDE conf API](avrdude-conf.herokuapp.com). Pull requests to the [avrgirl-chips-json repo](https://github.com/noopkat/avrgirl-chips-json) with additional chips is most welcome.

Here is the required signature, provided as an example of the ATtiny85:

```javascript
{
  "name": "ATtiny85",
  "timeout": 200,
  "stabDelay": 100,
  "cmdexeDelay": 25,
  "syncLoops": 32,
  "byteDelay": 0,
  "pollIndex": 3,
  "pollValue": 83,
  "preDelay": 1,
  "postDelay": 1,
  "pgmEnable": [172, 83, 0, 0],
  "erase": {
    "cmd": [172, 128, 0, 0],
    "delay": 45,
    "pollMethod": 1
  },
  "flash": {
    "write": [64, 76, 0],
    "read": [32, 0, 0],
    "mode": 65,
    "blockSize": 64,
    "delay": 10,
    "poll2": 255,
    "poll1": 255,
    "size": 8192,
    "pageSize": 64,
    "pages": 128,
    "addressOffset": 0
  },
  "eeprom": {
    "write": [193, 194, 0],
    "read": [160, 0, 0],
    "mode": 65,
    "blockSize": 4,
    "delay": 5,
    "poll2": 255,
    "poll1": 255,
    "size": 512,
    "pageSize": 4,
    "pages": 128,
    "addressOffset": 0
  },
  "sig": [30, 147, 11],
  "signature": {
    "size": 3,
    "startAddress": 0,
    "read": [48, 0, 0, 0]
  },
  "fuses": {
    "startAddress": 0,
    "write": {
      "low": [172, 160, 0, 0],
      "high": [172, 168, 0, 0],
      "ext": [172, 164, 0, 0]
    },
    "read": {
      "low": [80, 0, 0, 0],
      "high": [88, 8, 0, 0],
      "ext": [80, 8, 0, 0]
    }
  }
}
```

## Example use

The following will upload a program to the flash memory of an attiny85:

```javascript
var async = require('async');
var usbtinyisp = require('avrgirl-usbtinyisp');
var chips = require('avrgirl-chips-json');
var intelhex = require('intel-hex');
var fs = require('fs');

// open and parse program code
var data = fs.readFileSync('Blink-eeprom.cpp.hex', { encoding: 'utf8' });
var pData = intelhex.parse(data).data;

var avrgirl = new usbtinyisp({
	debug: true, 
	chip: chips.attiny85, 
	programmer: 'sf-pocket-avr'
});

avrgirl.on('ready', function() {
  // upload a program to flash memory
  async.series([
    avrgirl.enterProgrammingMode,
    avrgirl.writeFlash.bind(avrgirl, prBin),
    avrgirl.exitProgrammingMode
    ], function (error) {
      console.log('err', error);
      avrgirl.close();
    }
  );
});
```

## Available methods


### getChipSignature

Gets the signature of the microchip. 

Returns a buffer containing the signature bytes.

Usage:

```javascript
avrgirl.getChipSignature(function(error, signature) {
  console.log(signature);
});
```

### enterProgrammingMode

Enables programming mode on the microchip.

Returns a null error upon callback if successful.

```javascript
avrgirl.enterProgrammingMode(function(error) {
  console.log(error);
});
```

### exitProgrammingMode

Leaves programming mode on the microchip. Returns a null error upon callback if successful.

```javascript
avrgirl.exitProgrammingMode(function(error) {
  console.log(error);
});
```

### eraseChip

Erases both the flash and EEPROM memories on the microchip. Good practice to do before flashing any new data.

💣💣💣  Literally erases **everything** please be careful 💣💣💣  

Returns a null error upon callback if successful.

```javascript
avrgirl.eraseChip(function(error) {
  console.log(error);
});
```

### writeFlash

Writes a buffer to the flash memory of the microchip. Provide a buffer and a callback respectively.  
Protip: use the package [intel-hex](https://www.npmjs.com/package/intel-hex) if you need to parse a .hex file into a buffer for this method. See the example.

Returns a null error upon callback if successful.

```javascript
var intelhex = require('intel-hex');
var buffer = fs.readFileSync('Blink.cpp.hex', {encoding: 'utf8'});

avrgirl.writeFlash(buffer, function(error) {
  console.log(error);
});
```

### writeEeprom

Writes a buffer to the eeprom memory of the microchip. Provide a buffer and a callback respectively.  
Protip: use the package [intel-hex](https://www.npmjs.com/package/intel-hex) if you need to parse a .hex file into a buffer for this method. See the example.

Returns a null error upon callback if successful.

```javascript
var intelhex = require('intel-hex');
var buffer = fs.readFileSync('myEeprom.cpp.hex', {encoding: 'utf8'});

avrgirl.writeEeprom(buffer, function(error) {
  console.log(error);
});
```

### readFlash

Reads a specified length of flash memory from the microchip. Takes a length integer (or hex) for the number of bytes to read, a starting address integer, and a callback as the arguments, respectively. 

Returns a null error and a buffer of the read bytes upon callback if successful.

Usage:

```javascript
avrgirl.readFlash(4, 0, function(error, data) {
  console.log(data);
});
```

### readEeprom

Reads a specified length of flash memory from the microchip. Takes a length integer (or hex) for the number of bytes to read, a starting address integer, and a callback as the arguments, respectively. 

Returns a null error and a buffer of the read bytes upon callback if successful.

Usage:

```javascript
avrgirl.readFlash(4, 0, function(error, data) {
  console.log(error, data);
});
```

### open

Void. Upon instantiation, avrgirl-usbtinyisp opens a connection to the device. You shouldn't need to call this method unless you've previously closed the connection manually.

Usage:

```javascript
avrgirl.open();
```

### close

Void. Closes the connection to the USBtinyISP device.

Usage:

```javascript
avrgirl.close();
```

### spi

SPI is a shortcut to sending an instruction buffer, of which you're simply expecting an 'OK' back. Your instruction will be sent, and the callback will return a null error if an 'OK' response returned.

Returns a null error if successful.

```javascript
var buffer = new Buffer([0x01, 0x00, 0x00]);

avrgirl.spi(buffer, function(error) {
  console.log(error);
});
```
