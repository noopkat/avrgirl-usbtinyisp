var C = require('./lib/c');
// var usb = require('usb');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var usbtinyisp = require('usbtinyisp');

function avrgirlUsbTinyIsp (options) {
  this.options = {
    sck: options.sck || C.SCK_DEFAULT,
    debug: options.debug || false,
    chip: options.chip
  };

  this.debug = this.options.debug ? console.log : function() {};

  var usbOptions = {
    log: this.options.debug,
    // this pid and vid will probably vary between devices
    // it would be a better experience for users to add support for all by autosniffing for a connected device
    // just hardwiring (heh) to be the sf pocket avr for now
    pid: 3231,
    vid: 6017
  };

  //console.log(usb.getDeviceList());

  this.programmer = new usbtinyisp(usbOptions);

  EventEmitter.call(this);

  this.programmer.open(function() {
    setImmediate(emitReady, self)
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
    self.programmer.spi(cmd, function (error) {
      return callback(error);
    });
  });
};

avrgirlUsbTinyIsp.prototype.exitProgrammingMode = function (callback) {
  this.programmer.powerDown(function (error) {
    return callback(error);
  });
};

avrgirlUsbTinyIsp.prototype.setSCK = function (rate, callback) {
  if (typeof rate !== 'number' || rate < C.SCK_MIN || rate > C.SCK_MAX) {
    return callback(new Error('Could not set SCK: rate should be a number between ' + C.SCK_MIN + ' and ' + C.SCK_MAX + '.'));
  }

  this.programmer.setSCK(function(error) {
    return callback(error);
  });
};

avrgirlUsbTinyIsp.prototype.getSignature = function (callback) {
  var response = [];
  var signature = this.options.chip.signature;
  var cmd = new Buffer(signature.read);
  var sigLen = signature.size;
  var set = 0;

  function getSigByte() {
    this.programmer.spi(cmd, function (error, data) {
      if (error) { return callback(error); }
      // response[set] = data[sigPos];
      response[set] = data;
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

avrgirlUsbTinyIsp.prototype.verifySignature = function (callback) {

};

avrgirlUsbTinyIsp.prototype.writeFlash = function (data, callback) {

};

avrgirlUsbTinyIsp.prototype.readFlash = function (length, callback) {

};

avrgirlUsbTinyIsp.prototype.writeEeprom = function (data, callback) {

};

avrgirlUsbTinyIsp.prototype.readEeprom = function (length, callback) {

};

module.exports = avrgirlUsbTinyIsp;
