'use strict';

/**
 * Parses a string toolchain identifier into an object { channel: string, date: string }
 */
function parseToolchain(toolchainName) {
  if (toolchainName == null) { return null; }

  var ret_channel;
  var ret_date;
  ["nightly", "beta", "stable"].forEach(function(channel) {
    var prefix = channel + "-";
    var ix = toolchainName.indexOf(prefix);
    if (ix != -1) {
      ret_channel = channel;
      ret_date = toolchainName.slice(prefix.length);
    }
  });

  if (ret_channel) {
    return {
      channel: ret_channel,
      date: ret_date,
    };    
  } else {
    return null;
  }
}

exports.parseToolchain = parseToolchain
