const C = require('./lib/c');
const util = require('util');
const EventEmitter = require('events').EventEmitter;
const usbtinyisp = require('usbtinyisp');
const async = require('async');
const programmers = require('./lib/programmers');
const intelhex = require('intel-hex');
const fs = require('fs');
const chips = require('avrgirl-chips-json');

class avrgirlUsbTinyIsp extends EventEmitter {
  /**
   * Constructor
   *
   * @param {object} options - options for consumer to pass in
   */
  constructor(options) {
    super();

    var self = this;

    // set up noisy or quiet
    self.debug = options.debug ? console.log.bind(console) : () => {};

    // most people won't need this level of debug output
    self.hackerLog = options.hackerMode ? console.log.bind(console) : () => {};

    self.options = {
      sck: options.sck || C.SCK_DEFAULT,
      debug: options.debug || false,
      chip: options.chip || chips.attiny85,
      log: self.hackerLog,  // for usbtinyisp lib
      programmer: options.programmer || null
    };

    // fix this pls self, it's very unattractive
    // do an error check too
    if (options.programmer === 'custom') {
      if (!options.pid || !options.vid) throw new Error('please ensure your custom programmer options include both vid and pid properties');
      self.options.pid = options.pid;
      self.options.vid = options.vid;
    } else {
      var p = self.options.programmer ? programmers[self.options.programmer] : null;
      self.options.pid = p ? p.pid : 3231;
      self.options.vid = p ? p.vid : 6017;
    }

    // create new instance of usbtiny isp as programmer instance
    self.programmer = new usbtinyisp(self.options);

    self.programmer.open(error => {
      if (error) {
        console.error(error);
        return;
      }
      setImmediate(_emitReady, self);
    });
  }

  /**
   * Primes the programmer and the microchip for programming
   * Sets the clock speed of the programmer, and enables programming mode on the chip
   *
   * @param {function} callback - function to run upon completion/error
   */
  enterProgrammingMode(callback) {
    var self = this;

    var cmd = Buffer.from(self.options.chip.pgmEnable);

    self.setSCK(self.options.sck, error => {
      if (error) {
        return callback(error);
      }
      // is this timeout necessary?
      setTimeout(() =>
        self.programmer.spi(cmd, error => callback(error)), 50);
    });
  }

  /**
   * Powers down the programmer, allows the chip to leave programming mode
   *
   * @param {function} callback - function to run upon completion/error
   */
  exitProgrammingMode(callback) {
    this.programmer.powerDown(error => callback(error));
  }

  /**
   * Sets the clock speed of the programmer
   *
   * @param {number} rate - sck speed to set (not yet available)
   * @param {function} callback - function to run upon completion/error
   */
  setSCK(rate, callback) {
    // preparing for next version is usbtinyisp to be published allowing for custom clock rate
    if (!callback) {
      callback = rate;
    }

    // error checking for rate being a number
    if ((typeof rate !== 'number') || (rate < C.SCK_MIN) || (rate > C.SCK_MAX)) {
      return callback(new Error(`Could not set SCK: rate should be a number between ${C.SCK_MIN} and ${C.SCK_MAX}.`));
    }

    this.programmer.setSCK(error => callback(error));
  }

  /**
   * Returns the signature of the microchip connected, in array format
   *
   * @param {function} callback - function to run upon completion/error
   */
  getChipSignature(callback) {
    var response = [];
    var signature = this.options.chip.signature;
    var cmd = Buffer.from(signature.read);
    var sigLen = signature.size;
    var set = 0;
    var sigPos = 3;

    var self = this;

    // recursive function, according to length of the signature requested
    const getSigByte = () => {
      self.programmer.spi(cmd, (error, data) => {
        if (error) {
          return callback(error);
        }
        response[set] = data[sigPos];
        set += 1;
        cmd[2] = set;
        if (set < sigLen) {
          return getSigByte();
        }
        return callback(null, response);
      });
    };

    getSigByte();
  }

  /**
   * Compares two signatures to see if they match, returns a boolean
   *
   * @param {buffer} sig1 - the first siganture to be compared
   * @param {buffer} sig2 - the second siganture to be compared
   * @param {function} callback - function to run upon completion/error
   */
  verifySignature(sig1, sig2, callback) {
    // check sigs are buffers
    if (!Buffer.isBuffer(sig1) || !Buffer.isBuffer(sig2)) {
      return callback(new Error('Could not verify signature: both signatures should be buffers.'));
    }

    if (!sig1.equals(sig2)) {
      return callback(new Error('Failed to verify: signature does not match.'))
    }

    return callback(null);
  }

  /**
   * Writes the contents of a hex file to the requested memory type of the chip.
   *
   * @param {string} memType - the type of memory being written. Either 'flash' or 'eeprom'
   * @param {buffer} hex - a buffer containing the compiled hex program data
   * @param {function} callback - function to run upon completion/error
   */
  _writeMem(memType, hex, callback) {
    var self = this;
    var options = self.options.chip;
    var pageAddress = 0;
    var useAddress;
    var pageSize = options[memType].pageSize;
    var addressOffset = options[memType].addressOffset;
    var addressOffset = 1;
    var data, readFile;
    var page = 0;

    if(!pageSize){
      return callback(new Error(`could not write ${memType}: pageSize is not set for your chip`));
    }

    if (Buffer.isBuffer(hex)) {
      data = hex;
    } else if (typeof hex === 'string') {
      try {
        readFile = fs.readFileSync(hex, { encoding: 'utf8' });
      } catch (e) {
        if (e.code === 'ENOENT') {
          return callback(new Error(`could not write ${memType}: please supply a valid path to a hex file.`));
        }
        return callback(e);
      }

      data = intelhex.parse(readFile).data;

    } else {
      return callback(new Error(`could not write ${memType}: please supply either a hex buffer or a valid path to a hex file.`));
    }

    self.debug(`writing to ${memType}, please wait...`);
    self.hackerLog('page length:', hex.length / pageSize);

    async.whilst(
      // we exit out of this while loop when we are at the end of the hex file
      function testEndOfFile() {
        return pageAddress < data.length;
      },
      // main function to program the current page with data
      function programPage (pagedone) {
        // grab the correct chunk of data from our hex file
        var pageData = self._preparePageData(pageAddress, pageSize, data);

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
      error => callback(error)
    );
  }

  /**
   * Pulls out a (page sized) chunk of data from the hex buffer supplied, returns as a sliced buffer
   *
   * @param {number} address - the starting byte index of the chunk
   * @param {number} size - the page size, the size of data chunk you wish to receive back
   * @param {buffer} hex - a buffer containing the compiled hex program data
   */
  _preparePageData(address, size, hex) {
    return hex.slice(address, (hex.length > size ? (address + size) : hex.length - 1));
  }

  /**
   * Writes data to a page in the specified memory
   *
   * @param {string} memType - the type of memory being written. Either 'flash' or 'eeprom'
   * @param {number} delay - the chip's delay setting for memory writing
   * @param {number} address - the starting address index to write from
   * @param {buffer} hex - a buffer containing the compiled hex program data
  * @param {function} callback - function to run upon completion/error
  */
  _loadPage(memType, delay, address, buffer, callback) {
    if (memType === 'flash') {
      this.programmer.writeFlash(delay, address, buffer, (error, result) => callback(error));
    } else {
      this.programmer.writeEeprom(delay, address, buffer, (error, result) => callback(error));
    }
  }

  /**
   * Loads an address location in memory, to prepare for writing to a page
   *
   * @param {string} memType - the type of memory being written. Either 'flash' or 'eeprom'
   * @param {number} address - the starting address index to write from
   * @param {function} callback - function to run upon completion/error
   */
  _loadAddress(memType, address, callback) {
    var memCmd = this.options.chip[memType].write[1];
    var low = address & 0xff;
    var high = (address >> 8) & 0xff;
    var cmd = Buffer.from([memCmd, high, low, 0x00]);

    this.programmer.spi(cmd, (error, result) => callback(error, result));
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
  _pollForAddress(memType, address, offset, callback) {
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
  }

  /**
   * The public, straightforward method for writing hex data to the flash memory of a connected chip.
   *
   * @param {buffer} hex - a buffer containing the parsed hex file
   * @param {function} callback - function to run upon completion/error
   */
  writeFlash(hex, callback) {
    // optional convenience method
    this._writeMem('flash', hex, error => callback(error));
  }

  /**
   * The public, straightforward method for reading data from the flash memory of a connected chip.
   *
   * @param {number} length - the length of bytes wishing to be read
   * @param {number} address - the starting address from where to read
   * @param {function} callback - function to run upon completion/error
   */
  readFlash(length, address, callback) {
    // check length is a number
    if (typeof length !== 'number') {
      return callback(new Error('Could not read from flash: length should be a number'));
    }
    // check address is a number
    if (typeof address !== 'number') {
      return callback(new Error('Could not read from flash: address should be a number'));
    }
    return this.programmer.readFlash(this.options.chip.flash.delay, address, length, callback);
  }

  /**
   * The public, straightforward method for writing hex data to the eeprom memory of a connected chip.
   *
   * @param {buffer} hex - a buffer containing the parsed hex file
   * @param {function} callback - function to run upon completion/error
   */
  writeEeprom(hex, callback) {

    // optional convenience method
    this._writeMem('eeprom', hex, error => callback(error));
  }

  /**
   * The public, straightforward method for reading data from the eeprom memory of a connected chip.
   *
   * @param {number} length - the length of bytes wishing to be read
   * @param {number} address - the starting address from where to read
   * @param {function} callback - function to run upon completion/error
   */
  readEeprom(length, address, callback) {
    // check length is a number
    if (typeof length !== 'number') {
      return callback(new Error('Could not read from eeprom: length should be a number'));
    }
    // check address is a number
    if (typeof address !== 'number') {
      return callback(new Error('Could not read from eeprom: address should be a number'));
    }
    return this.programmer.readEeprom(this.options.chip.eeprom.delay, address, length, callback);
  }

  /**
   * The public method for erasing both eeprom and flash memories at the same time.
   *
   * @param {function} callback - function to run upon completion/error
   */
  eraseChip(callback) {
    var options = this.options;
    var programmer = programmers[options.programmer];

    // adafruit trinket has a reported erase delay of 900000µs but 500000µs seems to work ok, probably due to the runtime
    // other usbtinyisp devices just need the regular delay, or theoretically no delay at all.
    var delay = programmer.loris ? 500 : options.chip.erase.delay;

    this.debug('erasing, please wait...');

    this.programmer.spi(Buffer.from(options.chip.erase.cmd), error => setTimeout(() => callback(error), delay));
  }

  /**
   * Will close the connection to the programmer and chip.
   */
  close() {
    return this.programmer.close();
  }
}

// ready event emitter
function _emitReady (self) {
  self.emit('ready');
}

module.exports = avrgirlUsbTinyIsp;
