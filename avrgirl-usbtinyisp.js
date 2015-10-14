var C = require('./lib/c');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var usbtinyisp = require('usbtinyisp');
var bufferEqual = require('buffer-equal');
var async = require('async');
var programmers = require('./lib/programmers');

/**
 * Constructor
 *
 * @param {object} options - options for consumer to pass in
 */
function avrgirlUsbTinyIsp (options) {
  // set up noisy or quiet
  this.debug = options.debug ? console.log : function() {};

  // most people won't need this level of debug output
  this.hackerLog = options.hackerMode ? console.log : function() {};

  this.options = {
    sck: options.sck || C.SCK_DEFAULT,
    debug: options.debug || false,
    chip: options.chip,
    log: this.hackerLog,  // for usbtinyisp lib
    programmer: options.programmer || null
  };

  // fix this pls self, it's very unattractive
  // do an error check too
  var p = this.options.programmer ? programmers[this.options.programmer] : null;
  this.options.pid = p ? p.pid : 3231;
  this.options.vid = p ? p.vid : 6017;

  // create new instance of usbtiny isp as programmer instance
  this.programmer = new usbtinyisp(this.options);

  EventEmitter.call(this);

  var self = this;
  this.programmer.open(function() {
    setImmediate(_emitReady, self);
  });
}

util.inherits(avrgirlUsbTinyIsp, EventEmitter);

// ready event emitter
function _emitReady (self) {
  self.emit('ready');
}

/**
 * Primes the programmer and the microchip for programming
 * Sets the clock speed of the programmer, and enables programming mode on the chip
 *
 * @param {function} callback - function to run upon completion/error
 */
avrgirlUsbTinyIsp.prototype.enterProgrammingMode = function (callback) {
  var self = this;
  var cmd = new Buffer(this.options.chip.pgmEnable);

  this.setSCK(this.options.sck, function(error) {
    if (error) { return callback(error) }
    // is this timeout necessary?
    setTimeout(function() {
      self.programmer.spi(cmd, function (error) {
        return callback(error);
      });
    }, 50);
  });
};


/**
 * Powers down the programmer, allows the chip to leave programming mode
 *
 * @param {function} callback - function to run upon completion/error
 */
avrgirlUsbTinyIsp.prototype.exitProgrammingMode = function (callback) {
  this.programmer.powerDown(function (error) {
    return callback(error);
  });
};

/**
 * Sets the clock speed of the programmer
 *
 * @param {number} rate - sck speed to set (not yet available)
 * @param {function} callback - function to run upon completion/error
 */
avrgirlUsbTinyIsp.prototype.setSCK = function (rate, callback) {
  // preparing for next version is usbtinyisp to be published allowing for custom clock rate
  if (!callback) {
    var callback = rate;
  }

  // error checking for rate being a number
  if ((typeof rate !== 'number') || (rate < C.SCK_MIN) || (rate > C.SCK_MAX)) {
    return callback(new Error('Could not set SCK: rate should be a number between ' + C.SCK_MIN + ' and ' + C.SCK_MAX + '.'));
  }

  this.programmer.setSCK(function(error) {
    return callback(error);
  });
};

/**
 * Returns the signature of the microchip connected, in array format
 *
 * @param {function} callback - function to run upon completion/error
 */
avrgirlUsbTinyIsp.prototype.getChipSignature = function (callback) {
  var response = [];
  var signature = this.options.chip.signature;
  var cmd = new Buffer(signature.read);
  var sigLen = signature.size;
  var set = 0;
  var sigPos = 3;

  var self = this;

  // looping function, according to length of the signature requested
  function getSigByte() {
    self.programmer.spi(cmd, function (error, data) {
      if (error) { return callback(error); }
      response[set] = data[sigPos];
      set += 1;
      cmd[2] = set;
      if (set < sigLen) {
        getSigByte();
      } else {
        callback(null, response);
      }
    });
  };

  getSigByte();
};

/**
 * Compares two signatures to see if they match, returns a boolean
 *
 * @param {buffer} sig1 - the first siganture to be compared
 * @param {buffer} sig2 - the second siganture to be compared
 * @param {function} callback - function to run upon completion/error
 */
avrgirlUsbTinyIsp.prototype.verifySignature = function (sig1, sig2, callback) {
  var error = null;
  // check sigs are buffers
  if (!Buffer.isBuffer(sig1) || !Buffer.isBuffer(sig2)) {
    return callback(new Error('Could not verify signature: both signatures should be buffers.'));
  }
  // using @substack's buffer equal is the safest for all versions of nodejs
  if (!bufferEqual(sig1, sig2)) {
    error = new Error('Failed to verify: signature does not match.');
  }
  callback(error);
};

/**
 * Writes the contents of a hex file to the requested memory type of the chip.
 *
 * @param {string} memType - the type of memory being written. Either 'flash' or 'eeprom'
 * @param {buffer} hex - a buffer containing the compiled hex program data
 * @param {function} callback - function to run upon completion/error
 */
avrgirlUsbTinyIsp.prototype._writeMem = function (memType, hex, callback) {
  var self = this;
  var options = this.options.chip;
  var pageAddress = 0;
  var useAddress;
  var pageSize = options[memType].pageSize;
  var addressOffset = options[memType].addressOffset;
  var addressOffset = 1;
  var data;
  var page = 0;

  this.debug('writing to ' + memType + ', please wait...');
  this.hackerLog('page length:', hex.length / pageSize);

  async.whilst(
    // we exit out of this while loop when we are at the end of the hex file
    function testEndOfFile() {
      return pageAddress < hex.length;
    },
    // main function to program the current page with data
    function programPage (pagedone) {
      // grab the correct chunk of data from our hex file
      var pageData = self._preparePageData(pageAddress, pageSize, hex);

      // load data into current page
      self._loadPage(memType, 0, pageAddress, pageData, function (error) {
        if (error) { pagedone(error); }
        // load address once writing is done
        self._pollForAddress(memType, pageAddress, addressOffset, function (error) {
          // calculate the next page position
          if (!error) { pageAddress = pageAddress + pageSize; }
          // callback for the next page to be programmed
          pagedone(error);
        });
      });

    },
    function (error) {
      return callback(error);
    }
  );
};

/**
 * Pulls out a (page sized) chunk of data from the hex buffer supplied, returns as a sliced buffer
 *
 * @param {number} address - the starting byte index of the chunk
 * @param {number} size - the page size, the size of data chunk you wish to receive back
 * @param {buffer} hex - a buffer containing the compiled hex program data
 */
avrgirlUsbTinyIsp.prototype._preparePageData = function (address, size, hex) {
  return hex.slice(address, (hex.length > size ? (address + size) : hex.length - 1));
};

/**
 * Writes data to a page in the specified memory
 *
 * @param {string} memType - the type of memory being written. Either 'flash' or 'eeprom'
 * @param {number} delay - the chip's delay setting for memory writing
 * @param {number} address - the starting address index to write from
 * @param {buffer} hex - a buffer containing the compiled hex program data
* @param {function} callback - function to run upon completion/error
 */
avrgirlUsbTinyIsp.prototype._loadPage = function (memType, delay, address, buffer, callback) {
  if (memType === 'flash') {
    this.programmer.writeFlash(delay, address, buffer, function (error, result) {
      return callback(error);
    });
  } else {
    this.programmer.writeEeprom(delay, address, buffer, function (error, result) {
      return callback(error);
    });
  }
};

/**
 * Loads an address location in memory, to prepare for writing to a page
 *
 * @param {string} memType - the type of memory being written. Either 'flash' or 'eeprom'
 * @param {number} address - the starting address index to write from
 * @param {function} callback - function to run upon completion/error
 */
avrgirlUsbTinyIsp.prototype._loadAddress = function (memType, address, callback) {
  var memCmd = this.options.chip[memType].write[1];
  var low = address & 0xff;
  var high = (address >> 8) & 0xff;
  var cmd = new Buffer([memCmd, high, low, 0x00]);

  this.programmer.spi(cmd, function(error, result) {
    return callback(error, result);
  });
}

/**
 * Polls for a successful libusb transfer from the loadAddress method. Stops an auto-failure upon a busy chip.
 * Will retry 15 times before calling back with an error.
 *
 * @param {string} memType - the type of memory being written. Either 'flash' or 'eeprom'
 * @param {number} address - the starting address index to write from
 * @param {hex} offset - the chip's general offset setting
 * @param {function} callback - function to run upon completion/error
 */
avrgirlUsbTinyIsp.prototype._pollForAddress = function (memType, address, offset, callback) {
  var self = this;
  var times = 0;
  var useAddress = address >> offset;
  // try to load next address
  tryAddress();

  // we loop over this until we no longer get a libusb IO error.
  // this is for the Adafruit Trinket as it's both a chip breakout and a programmer in one
  function tryAddress() {
    self._loadAddress(memType, useAddress, function(error) {
      // let's check for an error and act accordingly
      handleState(error);
    });
  };

  // checks for error and bumps try times count
  function handleState(error) {
    times += 1;
    // this error is usually a libusb IO errno 1 (ie. the chip is busy still writing to the memory)
    if (!error) {
      self.hackerLog('_pollForAddress: success');
      // success at loading the address, so we callback with no error
      callback(null);
    } else {
      // how may times have we tried already without success?
      if (times < 15) {
        self.hackerLog('_pollForAddress: retrying ' + times);
        // we haven't exhausted our attempts, so let's try again
        setTimeout(tryAddress, 50);
      } else {
        self.hackerLog('_pollForAddress: ran out of attempts');
        // exhausted attempts and no success, callback with the error
        callback(error);
      }
    }
  }
};

/**
 * The public, straightforward method for writing hex data to the flash memory of a connected chip.
 *
 * @param {buffer} hex - a buffer containing the parsed hex file
 * @param {function} callback - function to run upon completion/error
 */
avrgirlUsbTinyIsp.prototype.writeFlash = function (hex, callback) {
  // check hex is a buffer
  if (!Buffer.isBuffer(hex)) {
    return callback(new Error('Could not write to flash: supplied hex argument should be a buffer.'));
  }
  // optional convenience method
  this._writeMem('flash', hex, function (error) {
    return callback(error);
  });
};

/**
 * The public, straightforward method for reading data from the flash memory of a connected chip.
 *
 * @param {number} length - the length of bytes wishing to be read
 * @param {number} address - the starting address from where to read
 * @param {function} callback - function to run upon completion/error
 */
avrgirlUsbTinyIsp.prototype.readFlash = function (length, address, callback) {
  // check length is a number
  if (typeof length !== 'number') {
    return callback(new Error('Could not read from flash: length should be a number'));
  }
  // check address is a number
  if (typeof address !== 'number') {
    return callback(new Error('Could not read from flash: address should be a number'));
  }
  return this.programmer.readFlash(this.options.chip.flash.delay, address, length, callback);
};

/**
 * The public, straightforward method for writing hex data to the eeprom memory of a connected chip.
 *
 * @param {buffer} hex - a buffer containing the parsed hex file
 * @param {function} callback - function to run upon completion/error
 */
avrgirlUsbTinyIsp.prototype.writeEeprom = function (hex, callback) {
  // check hex is a buffer
  if (!Buffer.isBuffer(hex)) {
    return callback(new Error('Could not write to eeprom: supplied hex argument should be a buffer.'));
  }
  // optional convenience method
  this._writeMem('eeprom', hex, function (error) {
    return callback(error);
  });
};

/**
 * The public, straightforward method for reading data from the eeprom memory of a connected chip.
 *
 * @param {number} length - the length of bytes wishing to be read
 * @param {number} address - the starting address from where to read
 * @param {function} callback - function to run upon completion/error
 */
avrgirlUsbTinyIsp.prototype.readEeprom = function (length, address, callback) {
  // check length is a number
  if (typeof length !== 'number') {
    return callback(new Error('Could not read from eeprom: length should be a number'));
  }
  // check address is a number
  if (typeof address !== 'number') {
    return callback(new Error('Could not read from eeprom: address should be a number'));
  }
  return this.programmer.readEeprom(this.options.chip.eeprom.delay, address, length, callback);
};

/**
 * The public method for erasing both eeprom and flash memories at the same time.
 *
 * @param {function} callback - function to run upon completion/error
 */
avrgirlUsbTinyIsp.prototype.eraseChip = function (callback) {
  var options = this.options;
  var programmer = programmers[options.programmer];

  // adafruit trinket has a reported erase delay of 900000µs but 500000µs seems to work ok, probably due to the runtime
  // other usbtinyisp devices just need the regular delay, or theoretically no delay at all.
  var delay = programmer.loris ? 500 : options.chip.erase.delay;

  this.debug('erasing, please wait...');

  this.programmer.spi(new Buffer(options.chip.erase.cmd), function (error) {
    return setTimeout(function() {
      callback(error);
    }, delay);
  });
};

/**
 * Will close the connection to the programmer and chip.
 */
avrgirlUsbTinyIsp.prototype.close = function () {
  return this.programmer.close();
};

module.exports = avrgirlUsbTinyIsp;
