// harness
var test = require('tape');
// test helpers
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var intelhex = require('intel-hex');
var fs = require('fs')
var chip = require('avrgirl-chips-json').attiny85;
var usbtinyispmock = require('./helpers/usbtinyisp-mock');

// module to test
var avrgirl = proxyquire.noCallThru().load('../avrgirl-usbtinyisp', { 'usbtinyisp': usbtinyispmock });

// test options to pass in to most tests
var FLoptions = {
  sck: 10,
  debug: false,
  chip: chip,
  log: false,  // for usbtinyisp lib
  programmer: 'sf-pocket-avr'
};

// test bin
var data = fs.readFileSync(__dirname + '/hex/trinketblink.hex', { encoding: 'utf8' });
var prBin = intelhex.parse(data).data;

function testBuffer(spy, call, arg, buffer) {
  return (spy.called && spy.args[call][arg] && buffer.equals(spy.args[call][arg]));
};

// run c tests
require('./c.spec');

test('[ AVRGIRL-USBTINYISP ] initialise', function (t) {
  var a = new avrgirl(FLoptions);
  t.equal(typeof a, 'object', 'new is object');
  t.end();
});


test('[ AVRGIRL-USBTINYISP ] ::initialise custom programmer', function (t) {
  var FLoptions = {
    sck: 10,
    debug: false,
    chip: chip,
    log: false,  // for usbtinyisp lib
    programmer: 'custom'
  };

  const createNewAvrgirl = () => new avrgirl(FLoptions);
  t.throws(createNewAvrgirl, Error, 'error throws when custom programmer does not supply vid and pid props');
  t.end();
});

// test bin

test('[ AVRGIRL-USBTINYISP ] device ready', function (t) {
  var a = new avrgirl(FLoptions);
  a.on('ready', function() {
    t.pass('emitted "ready"');
    t.end();
  });
  t.timeoutAfter(500);
});

test('[ AVRGIRL-USBTINYISP ] method presence', function (t) {
  var a = new avrgirl(FLoptions);
  function isFn(name) {
    return typeof a[name] === 'function';
  };
  var methods = [
    'close',
    'verifySignature',
    '_loadAddress',
    '_pollForAddress',
    '_loadPage',
    '_writeMem',
    '_preparePageData',
    'enterProgrammingMode',
    'exitProgrammingMode',
    'eraseChip',
    'writeFlash',
    'writeEeprom',
    'readFlash',
    'readEeprom',
    'getChipSignature',
    'setSCK'
  ];
  for (var i = 0; i < methods.length; i += 1) {
    t.ok(isFn(methods[i]), methods[i]);
    if (i === (methods.length - 1)) {
      t.end();
    }
  }
});

test('[ AVRGIRL-USBTINYISP ] ::verifySignature', function (t) {
  var a = new avrgirl(FLoptions);
  var data = Buffer.from([0x01, 0x02, 0x03]);
  var sig2 = Buffer.from([0x01, 0x02, 0x03]);
  var sig3 = Buffer.from([0xf3, 0xf4, 0xf5]);

  t.plan(2);

  a.verifySignature(sig2, data, function(error) {
    t.error(error, 'no error on identical signatures');
  });

  a.verifySignature(sig3, data, function(error) {
    t.ok(error, 'returns error on non matching signature');
  });
});

test('[ AVRGIRL-USBTINYISP ] ::close', function (t) {
  var a = new avrgirl(FLoptions);
  var spy = sinon.spy(a.programmer, 'close');

  t.plan(1);

  a.close();
  t.ok(spy.called, 'called programmer.close');
});


test('[ AVRGIRL-USBTINYISP ] ::enterProgrammingMode', function (t) {
  var a = new avrgirl(FLoptions);
  var spy = sinon.spy(a.programmer, 'spi');
  var spy2 = sinon.spy(a.programmer, 'setSCK');
  var cmd = Buffer.from([172, 83, 0, 0]);

  t.plan(3);

  a.enterProgrammingMode(function (error) {
    t.error(error, 'no error on callback');
    t.ok(spy2.called, 'called programmer.setSCK');
    t.ok(testBuffer(spy, 0, 0, cmd), 'called programmer.spi with correct buffer');
  });
});

test('[ AVRGIRL-USBTINYISP ] ::_writeMem with no page size specified', function (t) {
  var badchip = {
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
      "pageSize": null,
      "pages": 128,
      "addressOffset": 0
    }
  };

  var newoptions = {
    sck: 10,
    debug: false,
    chip: badchip,
    log: false,  // for usbtinyisp lib
    programmer: 'sf-pocket-avr'
  };

  var a = new avrgirl(newoptions);

  t.plan(2);

  a._writeMem('flash', '/hex/myhexfile.hex', function (error) {
    t.ok(error instanceof Error, 'error is present on callback');
    t.equals(error.message, 'could not write flash: pageSize is not set for your chip', 'error message matches expected');
  });
});

test('[ AVRGIRL-USBTINYISP ] ::exitProgrammingMode', function (t) {
  var a = new avrgirl(FLoptions);
  var spy = sinon.spy(a.programmer, 'powerDown');

  t.plan(2);

  a.exitProgrammingMode(function (error) {
    t.error(error, 'no error on callback');
    t.ok(spy.called, 'called programmer.powerDown');
  });
});

test('[ AVRGIRL-USBTINYISP ] ::getChipSignature', function (t) {
  var a = new avrgirl(FLoptions);
  var spy = sinon.spy(a.programmer, 'spi');
  var count = 3;

  t.plan(4);

  a.getChipSignature(function(error, data) {
    t.error(error, 'no error on callback');
    t.equals(spy.callCount, count, 'called spi for each byte');
    t.equals(typeof data, 'object', 'got parameter data back, type is object');
    t.equals(data.length, count, 'got parameter data back, correct length');
  });
});

// @noopkat to write rest soon.
