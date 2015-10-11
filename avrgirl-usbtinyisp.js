var C = require('./lib/c');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var usbtinyisp = require('usbtinyisp');
var bufferEqual = require('buffer-equal');
var async = require('async');
var programmers = require('./lib/programmers');
//var usb = require('usb');

function avrgirlUsbTinyIsp (options) {
  // set up noisy or quiet
  this.debug = options.debug ? console.log : function() {};

  // most people won't need this level of debug output
  this.hackerLog = options.hackerMode ? console.log : function() {};

  this.options = {
    sck: options.sck || C.SCK_DEFAULT,
    debug: options.debug || false,
    chip: options.chip,
    // for usbtinyisp lib
    log: this.hackerLog,
    programmer: options.programmer || null
  };

  // fix this pls self, it's very unattractive
  // do an error check too
  var p = this.options.programmer ? programmers[this.options.programmer] : null;
  this.options.pid = p ? p.pid : 3231;
  this.options.vid = p ? p.vid : 6017;

  //console.log(usb.getDeviceList());

  this.programmer = new usbtinyisp(this.options);

  EventEmitter.call(this);

  var self = this;
  this.programmer.open(function() {
    setImmediate(emitReady, self);
  });
}

util.inherits(avrgirlUsbTinyIsp, EventEmitter);

function emitReady (self) {
  self.emit('ready');
}

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

avrgirlUsbTinyIsp.prototype.exitProgrammingMode = function (callback) {
  this.programmer.powerDown(function (error) {
    return callback(error);
  });
};

avrgirlUsbTinyIsp.prototype.setSCK = function (rate, callback) {
  // preparing for next version is usbtinyisp to be published allowing for custom clock rate
  if (!callback) {
    var callback = rate;
  }

  if (typeof rate !== 'number' || rate < C.SCK_MIN || rate > C.SCK_MAX) {
    return callback(new Error('Could not set SCK: rate should be a number between ' + C.SCK_MIN + ' and ' + C.SCK_MAX + '.'));
  }

  this.programmer.setSCK(function(error) {
    return callback(error);
  });
};

avrgirlUsbTinyIsp.prototype.getChipSignature = function (callback) {
  var response = [];
  var signature = this.options.chip.signature;
  var cmd = new Buffer(signature.read);
  var sigLen = signature.size;
  var set = 0;
  var sigPos = 3;

  var self = this;

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

avrgirlUsbTinyIsp.prototype.verifySignature = function (sig, data, callback) {
  var error = null;
  if (!bufferEqual(data, sig)) {
    error = new Error('Failed to verify: signature does not match.');
  }
  callback(error);
};

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

  this.debug('page length:', hex.length / pageSize);

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

avrgirlUsbTinyIsp.prototype._preparePageData = function (address, size, hex) {
  return hex.slice(address, (hex.length > size ? (address + size) : hex.length - 1));
};

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

avrgirlUsbTinyIsp.prototype._loadAddress = function (memType, address, callback) {
  var memCmd = this.options.chip[memType].write[1];
  var low = address & 0xff;
  var high = (address >> 8) & 0xff;
  var cmd = new Buffer([memCmd, high, low, 0x00]);

  this.programmer.spi(cmd, function(error, result) {
    return callback(error, result);
  });
}

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

avrgirlUsbTinyIsp.prototype.writeFlash = function (hex, callback) {
  // optional convenience method
  this._writeMem('flash', hex, function (error) {
    return callback(error);
  });
};

avrgirlUsbTinyIsp.prototype.readFlash = function (length, address, callback) {
  return this.programmer.readFlash(this.options.chip.flash.delay, address, length, callback);
};

avrgirlUsbTinyIsp.prototype.writeEeprom = function (hex, callback) {
  // optional convenience method
  this._writeMem('eeprom', hex, function (error) {
    return callback(error);
  });
};

avrgirlUsbTinyIsp.prototype.readEeprom = function (length, address, callback) {
  return this.programmer.readEeprom(this.options.chip.eeprom.delay, address, length, callback);
};

avrgirlUsbTinyIsp.prototype.eraseChip = function (callback) {
  this.programmer.spi(new Buffer(this.options.chip.erase.cmd), function (error) {
    return callback(error);
  });
};

avrgirlUsbTinyIsp.prototype.close = function () {
  return this.programmer.close();
};

module.exports = avrgirlUsbTinyIsp;
