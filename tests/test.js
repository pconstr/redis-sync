#!/usr/local/bin/node

/*jslint white: true, browser: true, plusplus: true, vars: true, nomen: true, bitwise: true*/

/* Copyright 2011 Carlos Guerreiro
   All rights reserved */

'use strict';

var rh = require('rawhash');
var rs = require('../redis-sync.js');

var all = new rh.Dense();

var sync = new rs.Sync(true);

sync.rdb.on('entity', function(e) {
  switch(e[0]) {
  case rs.types.REDIS_STRING :
    console.log('STRING', e[1], e[2]);
    all.set(e[1], e[2]);
    break;
  case rs.types.REDIS_LIST:
    console.log('LIST', e[1], e[2]);
    all.set(e[1], e[2]);
    break;
  case rs.types.REDIS_SET:
    console.log('SET', e[1], e[2]);
    // TODO: store more appropriately
    all.set(e[1], e[2]);
    break;
  case rs.types.REDIS_ZSET:
    console.log('ZSET', e[1], e[2]);
    // TODO: store more appropriately
    all.set(e[1], e[2]);
    break;
  case rs.types.REDIS_HASH:
    console.log('HASH', e[1], e[2]);
    // TODO: store more appropriately
    all.set(e[1], e[2]);
    break;
  }
});

sync.rdb.on('error', function(err) {
  return console.error(err);
});
sync.rdb.on('end', function() {
  console.log('end of rdb');
});

sync.on('command', function(command, args) {
  console.log('command', command, args);
});

sync.on('inlineCommand', function(buffers) {
  console.log('inline command', buffers);
});

sync.on('error', function(err) {
  console.error(err);
});

sync.on('end', function() {
  console.log('end');
});

sync.connect();
