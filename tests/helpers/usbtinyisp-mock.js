function usbtinyisp (options) {

}

usbtinyisp.prototype.open = function(callback) {
  return callback(null);
};

usbtinyisp.prototype.close = function() {};

usbtinyisp.prototype.spi = function (buffer, callback) {
  return callback(null, Buffer.from([0x00, 0x00, 0x00]));
};

usbtinyisp.prototype.setSCK = function (callback) {
  return callback(null);
};

usbtinyisp.prototype.powerDown = function (callback) {
  return callback(null);
};

usbtinyisp.prototype.readFlash = function (length, address, callback) {
  var data = Buffer.alloc(length);
  data.fill(0xFF);
  return callback(null, data);
};

usbtinyisp.prototype.readEeprom = function (length, address, callback) {
  var data = Buffer.alloc(length);
  data.fill(0xFF);
  return callback(null, data);
};

usbtinyisp.prototype.readFlash = function (length, address, callback) {
  var data = Buffer.alloc(length);
  data.fill(0xFF);
  data[1] = 0x00;
  return callback(null, data);
};

usbtinyisp.prototype.writeFlash = function (callback) {
  return callback(null);
};

usbtinyisp.prototype.writeEeprom = function (callback) {
  return callback(null);
};

module.exports = usbtinyisp;
