#!/usr/local/bin/node

/*jslint white: true, browser: true, plusplus: true, vars: true, nomen: true, bitwise: true*/

/* Copyright 2011 Carlos Guerreiro
   All rights reserved */

'use strict';

var assert = require('assert');
var exec = require('child_process').exec;
var rh = require('rawhash');
var rs = require('../redis-sync.js');

var receivedEntities = {};
var receivedEntities2 = {};
var commandCounts = {};

var expectedCommandCounts = {
  append: 5,
  decr: 1,
  decrby: 1,
  incr: 2,
  incrby: 2,
  mset: 1,
  setbit: 40,
  setrange: 1,
  hset: 6,
  hincrby: 2,
  hdel: 1,
  hmset: 1,
  lpush: 2,
  rpush: 30,
  lpop: 1,
  rpop: 1,
  rpushx: 1,
  lpushx: 1,
  lrem: 1,
  linsert: 1,
  ltrim: 1,
  rpoplpush: 1,
  sort: 1,
  sadd: 1,
  smove: 1,
  srem: 1,
  zadd: 1,
  zincrby: 1,
  zrem: 1,
  set: 2,
  rename: 1 };

var sync = new rs.Sync();

function storeEntity(r, e) {
  var h = r[e[0]];
  if(!h) {
    r[e[0]] = h = new rh.Dense();
  }
  h.set(e[1], e[2]);
}

sync.on('entity', function(e) {
  storeEntity(receivedEntities, e);
});

sync.on('rdb', function(rdb) {
  rdb.on('entity', function(e) {
    storeEntity(receivedEntities2, e);
  });
  rdb.on('error', function(err) {
    console.error(err);
  });
  rdb.on('end', function() {
  });
});

sync.on('command', function(command, args) {
  commandCounts[command] = 1 + (commandCounts[command] || 0);
});

function keyCount(rh) {
  var count = 0;
  rh.each(function(k, v) { ++count; });
  return count;
}

var pingCount = 0;

sync.on('inlineCommand', function(buffers) {
  ++pingCount;
  if(pingCount === 1) {
    assert(keyCount(receivedEntities[rs.types.REDIS_STRING]) === 18);
    assert(keyCount(receivedEntities2[rs.types.REDIS_STRING]) === 18);
    assert(keyCount(receivedEntities[rs.types.REDIS_LIST]) === 12);
    assert(keyCount(receivedEntities2[rs.types.REDIS_LIST]) === 12);
    assert(keyCount(receivedEntities[rs.types.REDIS_SET]) === 6);
    assert(keyCount(receivedEntities2[rs.types.REDIS_SET]) === 6);
    assert(keyCount(receivedEntities[rs.types.REDIS_ZSET]) === 4);
    assert(keyCount(receivedEntities2[rs.types.REDIS_ZSET]) === 4);
    assert(keyCount(receivedEntities[rs.types.REDIS_HASH]) === 3);
    assert(keyCount(receivedEntities2[rs.types.REDIS_HASH]) === 3);
    var files = ['stringCommands.txt', 'hashCommands.txt', 'listCommands.txt', 'setCommands.txt', 'zsetCommands.txt', 'keyCommands.txt'];
    exec(files.map(function(n) { return 'redis-cli -x <./tests/'+ n; }).join(';'));
  }
  if(pingCount === 2) {
    var k;
    for(k in expectedCommandCounts) {
      assert.strictEqual(commandCounts[k], expectedCommandCounts[k], 'got '+ (commandCounts[k] || 0)+ ' '+ k+ ', expected '+ expectedCommandCounts[k]);
    }
    for(k in commandCounts) {
      if(commandCounts[k] > 0) {
        assert(expectedCommandCounts[k], 'got '+ commandCounts[k] + ' unexpected '+ k);
      }
    }
    console.log('OK');
    process.exit(0);
  }
});

sync.on('error', function(err) {
  console.error(err);
});

sync.on('end', function() {
});

sync.connect();
