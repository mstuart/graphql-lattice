// @flow

import fs, { readdirSync, statSync } from 'fs'
import path from 'path'
import * as types from './types'
import { GQLBase } from './GQLBase'
import { GQLJSON } from './types/GQLJSON'
import { merge } from 'lodash'
import {
  promisify,
  Deferred,
  getLatticePrefs,
  LatticeLogs as ll
} from './utils'

// Promisify some bits
const readdirAsync = promisify(fs.readdir)
const statAsync = promisify(fs.stat)

// Fetch some type checking bits from 'types'
const {
  typeOf,
  isString,
  isOfType,
  isPrimitive,
  isArray,
  isObject,
  extendsFrom
} = types;

/**
 * The ModuleParser is a utility class designed to loop through and iterate
 * on a directory and pull out of each .js file found, any classes or exports
 * that extend from GQLBase or a child of GQLBase.
 *
 * @class ModuleParser
 * @since 2.7.0
 */
export class ModuleParser {
  /**
   * An internal array of `GQLBase` extended classes found during either a
   * `parse()` or `parseSync()` call.
   *
   * @memberof ModuleParser
   * @type {Array<GQLBase>}
   */
  classes: Array<GQLBase>;

  /**
   * A map of skipped items on the last pass and the associated error that
   * accompanies it.
   */
  skipped: Map<string, Error>;

  /**
   * A string denoting the directory on disk where `ModuleParser` should be
   * searching for its classes.
   *
   * @memberof ModuleParser
   * @type {string}
   */
  directory: string;

  /**
   * A boolean value denoting whether or not the `ModuleParser` instance is
   * valid; i.e. the directory it points to actually exists and is a directory
   *
   * @type {boolean}
   */
  valid: boolean;

  /**
   * An object, optionally added during construction, that specifies some
   * configuration about the ModuleParser and how it should do its job.
   *
   * Initially, the
   *
   * @type {Object}
   */
  options: Object = {};

  /**
   * The constructor
   *
   * @constructor
   * @method ⎆⠀constructor
   * @memberof ModuleParser
   * @inner
   *
   * @param {string} directory a string path to a directory containing the
   * various GQLBase extended classes that should be gathered.
   */
  constructor(directory: string, options: Object = {addLatticeTypes: true}) {
    this.directory = path.resolve(directory);
    this.classes = [];
    this.skipped = new Map();

    merge(this.options, options);

    try {
      this.valid = fs.statSync(directory).isDirectory();
    }
    catch (error) {
      this.valid = false;
    }
  }

  /**
   * Given a file path, this method will attempt to import/require the
   * file in question and return the object it exported; whatever that
   * may be.
   *
   * @method ModuleParser#⌾⠀importClass
   * @since 2.7.0
   *
   * @param {string} filePath a path to pass to `require()`
   *
   * @return {Object} the object, or undefined, that was returned when
   * it was `require()`'ed.
   */
  importClass(filePath: string): Object {
    let moduleContents: Object = {};
    let yellow: string = '\x1b[33m'
    let clear: string = '\x1b[0m'

    try {
      moduleContents = require(filePath)
    }
    catch(ignore) {
      ll.log(`${yellow}Skipping${clear} ${filePath}`)
      ll.trace(ignore)
      this.skipped.set(filePath, ignore)
    }

    return moduleContents;
  }

  /**
   * Given an object, typically the result of a `require()` or `import`
   * command, iterate over its contents and find any `GQLBase` derived
   * exports. Continually, and recursively, build this list of classes out
   * so that we can add them to a `GQLExpressMiddleware`.
   *
   * @method ModuleParser#⌾⠀findGQLBaseClasses
   * @since 2.7.0
   *
   * @param {Object} contents the object to parse for properties extending
   * from `GQLBase`
   * @param {Array<GQLBase>} gqlDefinitions the results, allowed as a second
   * parameter during recursion as a means to save state between calls
   * @return {Set<mixed>} a unique set of values that are currently being
   * iterated over. Passed in as a third parameter to save state between calls
   * during recursion.
   */
  findGQLBaseClasses(
    contents: Object,
    gqlDefinitions?: Array<GQLBase> = [],
    stack?: Set<GQLBase> = new Set()
  ): Array<GQLBase> {
    // In order to prevent infinite object recursion, we should add the
    // object being iterated over to our Set. At each new recursive level
    // add the item being iterated over to the set and only recurse into
    // if the item does not already exist in the stack itself.
    stack.add(contents)

    for (let key in contents) {
      let value = contents[key];

      if (isPrimitive(value)) { continue }

      if (extendsFrom(value, GQLBase)) {
        gqlDefinitions.push(value)
      }

      if ((isObject(value) || isArray(value)) && !stack.has(value)) {
        gqlDefinitions = this.findGQLBaseClasses(value, gqlDefinitions, stack);
      }
    }

    // We remove the current iterable from our set as we leave this current
    // recursive iteration.
    stack.delete(contents)

    return gqlDefinitions
  }

  /**
   * This method takes a instance of ModuleParser, initialized with a directory,
   * and walks its contents, importing files as they are found, and sorting
   * any exports that extend from GQLBase into an array of such classes
   * in a resolved promise.
   *
   * @method ModuleParser#⌾⠀parse
   * @async
   * @since 2.7.0
   *
   * @return {Promise<Array<GQLBase>>} an array GQLBase classes, or an empty
   * array if none could be identified.
   */
  async parse(): Promise<Array<GQLBase>> {
    let modules
    let files
    let set = new Set();
    let opts = getLatticePrefs()

    if (!this.valid) {
      throw new Error(`
        ModuleParser instance is invalid for use with ${this.directory}.
        The path is either a non-existent path or it does not represent a
        directory.
      `)
    }

    this.skipped.clear()

    // @ComputedType
    files = await this.constructor.walk(this.directory)
    modules = files.map(file => this.importClass(file))

    // @ComputedType
    (modules
      .map(mod => this.findGQLBaseClasses(mod))
      .reduce((last, cur) => (last || []).concat(cur || []), [])
      .forEach(Class => set.add(Class)))

    // Convert the set back into an array
    this.classes = Array.from(set);

    // We can ignore equality since we came from a set; @ComputedType
    this.classes.sort((l,r) => l.name < r.name ? -1 : 1)

    // Add in any GraphQL Lattice types requested
    if (this.options.addLatticeTypes) {
      this.classes.push(GQLJSON)
    }

    // Stop flow and throw an error if some files failed to load and settings
    // declare we should do so. After Lattice 3.x we should expect this to be
    // the new default
    if (opts.ModuleParser.failOnError && this.skipped.size) {
      this.printSkipped()
      throw new Error('Some files skipped due to errors')
    }

    return this.classes;
  }

  /**
   * This method takes a instance of ModuleParser, initialized with a directory,
   * and walks its contents, importing files as they are found, and sorting
   * any exports that extend from GQLBase into an array of such classes
   *
   * @method ModuleParser#⌾⠀parseSync
   * @async
   * @since 2.7.0
   *
   * @return {Array<GQLBase>} an array GQLBase classes, or an empty
   * array if none could be identified.
   */
  parseSync(): Array<GQLBase> {
    let modules: Array<Object>;
    let files: Array<string>;
    let set = new Set();
    let opts = getLatticePrefs()

    if (!this.valid) {
      throw new Error(`
        ModuleParser instance is invalid for use with ${this.directory}.
        The path is either a non-existent path or it does not represent a
        directory.
      `)
    }

    this.skipped.clear()

    files = this.constructor.walkSync(this.directory)
    modules = files.map(file => {
      return this.importClass(file)
    })

    modules
      .map(mod => this.findGQLBaseClasses(mod))
      .reduce((last, cur) => (last || []).concat(cur || []), [])
      .forEach(Class => set.add(Class))

    // Convert the set back into an array
    this.classes = Array.from(set);

    // We can ignore equality since we came from a set; @ComputedType
    this.classes.sort((l,r) => l.name < r.name ? -1 : 1)

    // Add in any GraphQL Lattice types requested
    if (this.options.addLatticeTypes) {
      this.classes.push(GQLJSON)
    }

    // Stop flow and throw an error if some files failed to load and settings
    // declare we should do so. After Lattice 3.x we should expect this to be
    // the new default
    if (opts.ModuleParser.failOnError && this.skipped.size) {
      this.printSkipped()
      throw new Error('Some files skipped due to errors')
    }

    return this.classes;
  }

  /**
   * Prints the list of skipped files, their stack traces, and the errors
   * denoting the reasons the files were skipped.
   */
  printSkipped() {
    if (this.skipped.size) {
      ll.outWrite('\x1b[1;91m')
      ll.outWrite('Skipped\x1b[0;31m the following files\n')

      for (let [key, value] of this.skipped) {
        ll.log(`${path.basename(key)}: ${value.message}`)
        if (value.stack)
          ll.log(value.stack.replace(/(^)/m, '$1  '))
      }

      ll.outWrite('\x1b[0m')
    }
    else {
      ll.log('\x1b[1;32mNo files skipped\x1b[0m')
    }
  }

  /**
   * Returns the `constructor` name. If invoked as the context, or `this`,
   * object of the `toString` method of `Object`'s `prototype`, the resulting
   * value will be `[object MyClass]`, given an instance of `MyClass`
   *
   * @method ⌾⠀[Symbol.toStringTag]
   * @memberof ModuleParser
   *
   * @return {string} the name of the class this is an instance of
   * @ComputedType
   */
  get [Symbol.toStringTag]() { return this.constructor.name }

  /**
   * Applies the same logic as {@link #[Symbol.toStringTag]} but on a static
   * scale. So, if you perform `Object.prototype.toString.call(MyClass)`
   * the result would be `[object MyClass]`.
   *
   * @method ⌾⠀[Symbol.toStringTag]
   * @memberof ModuleParser
   * @static
   *
   * @return {string} the name of this class
   * @ComputedType
   */
  static get [Symbol.toStringTag]() { return this.name }

  /**
   * Recursively walks a directory and returns an array of asbolute file paths
   * to the files under the specified directory.
   *
   * @method ModuleParser~⌾⠀walk
   * @async
   * @since 2.7.0
   *
   * @param {string} dir string path to the top level directory to parse
   * @param {Array<string>} filelist an array of existing absolute file paths,
   * or if not parameter is supplied a default empty array will be used.
   * @return {Promise<Array<string>>} an array of existing absolute file paths
   * found under the supplied `dir` directory.
   */
  static async walk(
    dir: string,
    filelist: Array<string> = [],
    extensions: Array<string> = ['.js', '.jsx', '.ts', '.tsx']
  ): Promise<Array<string>> {
    let files = await readdirAsync(dir);
    let exts = ModuleParser.checkForPackageExtensions() || extensions
    let pattern = ModuleParser.arrayToPattern(exts)
    let stats

    files = files.map(file => path.resolve(path.join(dir, file)))

    for (let file of files) {
      stats = await statAsync(file)
      if (stats.isDirectory()) {
        filelist = await this.walk(file, filelist)
      }
      else {
        if (pattern.test(path.extname(file)))
          filelist = filelist.concat(file);
      }
    }

    return filelist;
  }

  /**
   * Recursively walks a directory and returns an array of asbolute file paths
   * to the files under the specified directory. This version does this in a
   * synchronous fashion.
   *
   * @method ModuleParser~⌾⠀walkSync
   * @async
   * @since 2.7.0
   *
   * @param {string} dir string path to the top level directory to parse
   * @param {Array<string>} filelist an array of existing absolute file paths,
   * or if not parameter is supplied a default empty array will be used.
   * @return {Array<string>} an array of existing absolute file paths found
   * under the supplied `dir` directory.
   */
  static walkSync(
    dir: string,
    filelist: Array<string> = [],
    extensions: Array<string> = ['.js', '.jsx', '.ts', '.tsx']
  ): Array<string> {
    let files = readdirSync(dir)
    let exts = ModuleParser.checkForPackageExtensions() || extensions
    let pattern = ModuleParser.arrayToPattern(exts)
    let stats

    files = files.map(file => path.resolve(path.join(dir, file)))

    for (let file of files) {
      stats = statSync(file)
      if (stats.isDirectory()) {
        filelist = this.walkSync(file, filelist)
      }
      else {
        if (pattern.test(path.extname(file)))
          filelist = filelist.concat(file);
      }
    }

    return filelist;
  }

  /**
   * The ModuleParser should only parse files that match the default or
   * supplied file extensions. The default list contains .js, .jsx, .ts
   * and .tsx; so JavaScript or TypeScript files and their JSX React
   * counterparts
   *
   * Since the list is customizable for a usage, however, it makes sense
   * to have a function that will match what is supplied rather than
   * creating a constant expression to use instead.
   *
   * @static
   * @memberof ModuleParser
   * @function ⌾⠀arrayToPattern
   * @since 2.13.0
   *
   * @param {Array<string>} extensions an array of extensions to
   * convert to a regular expression that would pass for each
   * @param {string} flags the value passed to a new RegExp denoting the
   * flags used in the pattern; defaults to 'i' for case insensitivity
   * @return {RegExp} a regular expression object matching the contents
   * of the array of extensions or the default extensions and that will
   * also match those values in a case insensitive manner
   */
  static arrayToPattern(
    extensions: Array<string> = ['.js', '.jsx', '.ts', '.tsx'],
    flags: string = 'i'
  ) {
    return new RegExp(
      extensions
        .join('|')
        .replace(/\./g, '\\.')
        .replace(/([\|$])/g, '\\b$1'),
      flags
    )
  }

  /**
   * Using the module `read-pkg-up`, finds the nearest package.json file
   * and checks to see if it has a `.lattice.moduleParser.extensions'
   * preference. If so, if the value is an array, that value is used,
   * otherwise the value is wrapped in an array. If the optional parameter
   * `toString` is `true` then `.toString()` will be invoked on any non
   * Array values found; this behavior is the default
   *
   * @static
   * @memberof ModuleParser
   * @method ⌾⠀checkForPackageExtensions
   * @since 2.13.0
   *
   * @param {boolean} toString true if any non-array values should have
   * their `.toString()` method invoked before being wrapped in an Array;
   * defaults to true
   * @return {?Array<string>} null if no value is set for the property
   * `lattice.ModuleParser.extensions` in `package.json` or the value
   * of the setting if it is an array. Finally if the value is set but is
   * not an array, the specified value wrapped in an array is returned
   */
  static checkForPackageExtensions(toString: boolean = true): ?Array<string> {
    let pkg = getLatticePrefs()
    let extensions = null

    if (pkg.ModuleParser && pkg.ModuleParser.extensions) {
      let packageExts = pkg.ModuleParser.extensions

      if (Array.isArray(packageExts)) {
        extensions = packageExts
      }
      else {
        extensions = [toString ? packageExts.toString() : packageExts]
      }
    }

    return extensions
  }
}

export default ModuleParser;
