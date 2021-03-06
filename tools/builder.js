#!/usr/bin/env node

"use strict";
const async = require("marcosc-async");
const fsp = require("fs-promise");
const pth = require("path");
const r = require("requirejs");

/**
 * Finds the name of the map file generated by Requirejs, and replaces it
 * with one that matches the filename of the ReSpec output file.
 *
 * @param  {String} respecJs The source for ReSpec, as produced by Requirejs.
 * @param  {String} outPath The path for the ReSpec source output file.
 * @return {Object} An object with a updated `source` and the new filename for
 *                  the map file.
 */

function replaceMapFilename(respecJs, outPath){
  // Capture group 1 is the name
  const findSourceMapName = /\/\/# sourceMappingURL=(.+)/gm;
  const basename = pth.basename(outPath, ".js");
  const newMapFilename = basename + ".build.js.map";
  let source;
  if(findSourceMapName.test(respecJs)){
    const currentMapFilename = respecJs.match(findSourceMapName)[1];
    source = respecJs.replace(currentMapFilename, newMapFilename);
  } else {
    const warn = "🚨️ The source map is missing. Something has probably gone wrong.";
    console.warn(warn);
    source = respecJs;
  }
  const mapPath = pth.resolve(outPath, `../${newMapFilename}`);
  return {
    source,
    mapPath,
  };
}

 /**
 * Async function that appends the boilerplate to the generated script
 * and writes out the result. It also creates the source map file.
 *
 * @private
 * @param  {String} outPath Where to write the output to.
 * @param  {String} version The version of the script.
 * @return {Promise} Resolves when done writing the files.
 */
function appendBoilerplate(outPath, version) {
  return async(function*(optimizedJs, sourceMap) {
    const respecJs = `"use strict";
/* ReSpec ${version}
Created by Robin Berjon, http://berjon.com/ (@robinberjon)
Documentation: http://w3.org/respec/.
See original source for licenses: https://github.com/w3c/respec */
window.respecVersion = "${version}";
${optimizedJs}
require(['profile-w3c-common']);`;
    const newSource = replaceMapFilename(respecJs, outPath);
    const promiseToWriteJs = fsp.writeFile(outPath, newSource.source, "utf-8");
    const promiseToWriteMap = fsp.writeFile(newSource.mapPath, sourceMap, "utf-8");
    yield Promise.all([promiseToWriteJs, promiseToWriteMap]);
  }, Builder);
}

var Builder = {
  /**
   * Async function that gets the current version of ReSpec from package.json
   *
   * @returns {Promise<String>} The version string.
   */
  getRespecVersion: async(function*() {
    const path = pth.join(__dirname, "../package.json");
    const content = yield fsp.readFile(path, "utf-8");
    return JSON.parse(content).version;
  }),

  /**
   * Async function runs Requirejs' optimizer to generate the output.
   *
   * using a custom configuration.
   * @param  {[type]} options [description]
   * @return {[type]}         [description]
   */
  build(options) {
    return async.task(function*() {
      // optimisation settings
      const version = options.version || (yield this.getRespecVersion());
      const outputWritter = appendBoilerplate(options.out, version);
      const config = {
        generateSourceMaps: true,
        mainConfigFile: "js/profile-w3c-common.js",
        baseUrl: pth.join(__dirname, "../js/"),
        optimize: options.optimize || "uglify2",
        name: "profile-w3c-common",
        logLevel: 2, // Show uglify warnings and errors.
        deps: [
          "deps/require",
        ],
        inlineText: true,
        preserveLicenseComments: false,
        useStrict: true,
      };
      const promiseToWrite = new Promise((resolve, reject)=>{
        config.out = (optimizedJs, sourceMap) => {
          outputWritter(optimizedJs, sourceMap)
            .then(resolve)
            .catch(reject);
        };
      });
      r.optimize(config);
      yield promiseToWrite;
    }, this);
  },
};

exports.Builder = Builder;
