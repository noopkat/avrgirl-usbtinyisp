// harness
var test = require('tape');
// test helpers
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var bufferEqual = require('buffer-equal');
var intelhex = require('intel-hex');
var fs = require('fs')
var chip = require('avrgirl-chips-json').attiny85;
var usbtinyispmock = require('./helpers/usbtinyisp-mock');

// module to test
var avrgirl = proxyquire('../avrgirl-usbtinyisp', { 'usbtinyisp': usbtinyispmock });

// test options to pass in to most tests
var FLoptions = {
  sck: 10,
  debug: false,
  chip: chip,
  log: false,  // for usbtinyisp lib
  programmer: 'sf-pocket-avr'
};

// test bin
var data = fs.readFileSync('trinketblink.hex', { encoding: 'utf8' });
var prBin = intelhex.parse(data).data;

function testBuffer(spy, call, arg, buffer) {
  return (spy.called && spy.args[call][arg] && bufferEqual(spy.args[call][arg], buffer));
};

// run c tests
require('./c.spec');

test('[ AVRGIRL-USBTINYISP ] initialise', function (t) {
  var a = new avrgirl(FLoptions);
  t.equal(typeof a, 'object', 'new is object');
  t.end();
});

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
