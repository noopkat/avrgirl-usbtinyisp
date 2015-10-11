// harness
var test = require('tape');
// test helpers
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var bufferEqual = require('buffer-equal');
var chip = require('avrgirl-chips-json').attiny85;
var usbtinyispmock = require('./helpers/usbtinyisp-mock');

// module to test
var avrgirl = proxyquire('../avrgirl-usbtinyisp', { 'usbtinyisp': usbtinyispmock });

// test options to pass in to most tests
var options = {
  sck: 10,
  debug: false,
  chip: chip,
  log: false,  // for usbtinyisp lib
  programmer: 'sf-pocket-avr'
};

  this.options.pid = p ? p.pid : 3231;
  this.options.vid = p ? p.vid : 6017;

function testBuffer(spy, call, arg, buffer) {
  return (spy.called && spy.args[call][arg] && bufferEqual(spy.args[call][arg], buffer));
};

// run c tests
require('./c.spec');

