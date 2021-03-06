// @flow

import path from 'path'
import { SyntaxTree } from './SyntaxTree'
import { GQLBase, META_KEY } from './GQLBase'
import { GQLEnum } from './GQLEnum'
import { GQLInterface } from './GQLInterface'
import { GQLScalar } from './GQLScalar'
import { typeOf } from './types'
import { LatticeLogs as ll } from './utils'
import { merge } from 'lodash'
import EventEmitter from 'events'
import {
  parse,
  print,
  buildSchema,
  GraphQLInterfaceType,
  GraphQLEnumType,
  GraphQLScalarType,
  GraphQLSchema
} from 'graphql'

/**
 * The SchemaUtils is used by tools such as GQLExpressMiddleware in order to
 * apply GraphQL Lattice specifics to the build schema.
 *
 * @class SchemaUtils
 */
export class SchemaUtils extends EventEmitter {
  /**
   * Calls all the Lattice post-schema creation routines on a given Schema
   * using data from a supplied array of classes.
   *
   * @param {GraphQLSchema} schema the schema to post-process
   * @param {Array<GQLBase>} Classes the Classes from which to drive post
   * processing data from
   */
  static injectAll(schema: GraphQLSchema, Classes: Array<GQLBase>) {
    SchemaUtils.injectInterfaceResolvers(schema, Classes);
    SchemaUtils.injectEnums(schema, Classes);
    SchemaUtils.injectScalars(schema, Classes);
    SchemaUtils.injectComments(schema, Classes);
  }

  /**
   * Until such time as I can get the reference Facebook GraphQL AST parser to
   * read and apply descriptions or until such time as I employ the Apollo
   * AST parser, providing a `static get apiDocs()` getter is the way to get
   * your descriptions into the proper fields, post schema creation.
   *
   * This method walks the types in the registered classes and the supplied
   * schema type. It then injects the written comments such that they can
   * be exposed in graphiql and to applications or code that read the meta
   * fields of a built schema
   *
   * @memberof SchemaUtils
   * @method ⌾⠀injectComments
   * @static
   * @since 2.7.0
   *
   * @param {Object} schema a built GraphQLSchema object created via buildSchema
   * or some other alternative but compatible manner
   * @param {Function[]} Classes these are GQLBase extended classes used to
   * manipulate the schema with.
   */
  static injectComments(schema: Object, Classes: Array<GQLBase>) {
    const {
      DOC_CLASS, DOC_FIELDS, DOC_QUERIES, DOC_MUTATORS, DOC_SUBSCRIPTIONS,
      DOC_QUERY, DOC_MUTATION, DOC_SUBSCRIPTION
    } = GQLBase;

    for (let Class of Classes) {
      const docs = Class.apiDocs();
      const query = schema._typeMap.Query;
      const mutation = schema._typeMap.Mutation;
      const subscription = schema._typeMap.Subscription;
      let type;

      if ((type = schema._typeMap[Class.name])) {
        let fields = type._fields;
        let values = type._values;

        if (docs[DOC_CLASS]) { type.description = docs[DOC_CLASS] }

        for (let field of Object.keys(docs[DOC_FIELDS] || {})) {
          if (fields && field in fields) {
            fields[field].description = docs[DOC_FIELDS][field];
          }
          if (values) {
            for (let value of values) {
              if (value.name === field) {
                value.description = docs[DOC_FIELDS][field]
              }
            }
          }
        }
      }

      for (let [_type, _CONST, _topCONST] of [
        [query, DOC_QUERIES, DOC_QUERY],
        [mutation, DOC_MUTATORS, DOC_MUTATION],
        [subscription, DOC_SUBSCRIPTIONS, DOC_SUBSCRIPTION]
      ]) {
        if (
          _type
          && (
            (Object.keys(docs[_CONST] || {}).length)
            || (docs[_topCONST] && docs[_topCONST].length)
          )
        ) {
          let fields = _type._fields;

          if (docs[_topCONST]) {
            _type.description = docs[_topCONST]
          }

          for (let field of Object.keys(docs[_CONST])) {
            if (field in fields) {
              fields[field].description = docs[_CONST][field];
            }
          }
        }
      }
    }
  }

  /**
   * Somewhat like `injectComments` and other similar methods, the
   * `injectInterfaceResolvers` method walks the registered classes and
   * finds `GQLInterface` types and applies their `resolveType()`
   * implementations.
   *
   * @memberof SchemaUtils
   * @method ⌾⠀injectInterfaceResolvers
   * @static
   *
   * @param {Object} schema a built GraphQLSchema object created via buildSchema
   * or some other alternative but compatible manner
   * @param {Function[]} Classes these are GQLBase extended classes used to
   * manipulate the schema with.
   */
  static injectInterfaceResolvers(schema: Object, Classes: Array<GQLBase>) {
    for (let Class of Classes) {
      if (Class.GQL_TYPE === GraphQLInterfaceType) {
        schema._typeMap[Class.name].resolveType =
        schema._typeMap[Class.name]._typeConfig.resolveType =
          Class.resolveType;
      }
    }
  }

  /**
   * Somewhat like `injectComments` and other similar methods, the
   * `injectInterfaceResolvers` method walks the registered classes and
   * finds `GQLInterface` types and applies their `resolveType()`
   * implementations.
   *
   * @memberof SchemaUtils
   * @method ⌾⠀injectEnums
   * @static
   *
   * @param {Object} schema a built GraphQLSchema object created via buildSchema
   * or some other alternative but compatible manner
   * @param {Function[]} Classes these are GQLBase extended classes used to
   * manipulate the schema with.
   */
  static injectEnums(schema: Object, Classes: Array<GQLBase>) {
    for (let Class of Classes) {
      if (Class.GQL_TYPE === GraphQLEnumType) {
        const __enum = schema._typeMap[Class.name];
        const values = Class.values;

        for (let value of __enum._values) {
          if (value.name in values) {
            merge(value, values[value.name])
          }
        }
      }
    }
  }

  /**
   * GQLScalar types must define three methods to have a valid implementation.
   * They are serialize, parseValue and parseLiteral. See their docs for more
   * info on how to do so.
   *
   * This code finds each scalar and adds their implementation details to the
   * generated schema type config.
   *
   * @memberof SchemaUtils
   * @method ⌾⠀injectScalars
   * @static
   *
   * @param {Object} schema a built GraphQLSchema object created via buildSchema
   * or some other alternative but compatible manner
   * @param {Function[]} Classes these are GQLBase extended classes used to
   * manipulate the schema with.
   */
  static injectScalars(schema: Object, Classes: Array<GQLBase>) {
    for (let Class of Classes) {
      if (Class.GQL_TYPE === GraphQLScalarType) {
        // @ComputedType
        const type = schema._typeMap[Class.name];

        // @ComputedType
        const { serialize, parseValue, parseLiteral } = Class;

        if (!serialize || !parseValue || !parseLiteral) {
          // @ComputedType
          ll.error(`Scalar type ${Class.name} has invaild impl.`);
          continue;
        }

        merge(type._scalarConfig, {
          serialize,
          parseValue,
          parseLiteral
        });
      }
    }
  }

  /**
   * A function that combines the IDL schemas of all the supplied classes and
   * returns that value to the middleware getter.
   *
   * @static
   * @memberof GQLExpressMiddleware
   * @method ⌾⠀generateSchemaSDL
   *
   * @return {string} a dynamically generated GraphQL IDL schema string
   */
  static generateSchemaSDL(
    Classes: Array<GQLBase>,
    logOutput: boolean = true
  ): string {
    let schema = SyntaxTree.EmptyDocument();
    let log = (...args) => {
      if (logOutput) {
        console.log(...args);
      }
    }

    for (let Class of Classes) {
      let classSchema = Class.SCHEMA;

      if (typeOf(classSchema) === 'Symbol') {
        let handler = Class.handler;
        let filename = path.basename(Class.handler.path)

        classSchema = handler.getSchema();
        log(
          `\nRead schema (%s)\n%s\n%s\n`,
          filename,
          '-'.repeat(14 + filename.length),
          classSchema.replace(/^/gm, '  ')
        )
      }

      schema.appendDefinitions(classSchema);
    }

    log('\nGenerated GraphQL Schema\n----------------\n%s', schema);

    return schema.toString();
  }

  /**
   * An asynchronous function used to parse the supplied classes for each
   * ones resolvers and mutators. These are all combined into a single root
   * object passed to express-graphql.
   *
   * @static
   * @memberof SchemaUtils
   * @method ⌾⠀createMergedRoot
   *
   * @param {Array<GQLBase>} Classes the GQLBase extended class objects or
   * functions from which to merge the RESOLVERS and MUTATORS functions.
   * @param {Object} requestData for Express apss, this will be an object
   * containing { req, res, gql } where those are the Express request and
   * response object as well as the GraphQL parameters for the request.
   * @return {Promise<Object>} a Promise resolving to an Object containing all
   * the functions described in both Query and Mutation types.
   */
  static async createMergedRoot(
    Classes: Array<GQLBase>,
    requestData: Object,
    separateByType: boolean = false
  ): Promise<Object> {
    const root = {};

    for (let Class of Classes) {
      merge(
        root,
        // $FlowFixMe
        await Class.getMergedRoot(requestData, separateByType)
      );
    }

    return root;
  }
}

export default SchemaUtils
