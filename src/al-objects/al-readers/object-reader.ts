import { Helper } from "../helper";
import { IToken, Tokenizer } from "../tokenizer";
import { VariablesReader } from "./variables-reader";
import { FunctionReader } from "./function-reader";
import { Keywords } from "../keywords";
import { FieldsReader } from "./fields-reader";
import { PropertyReader } from "./property-reader";
import { LayoutReader } from "./layout-reader";
import { ActionContainerReader } from "./action-container-reader";
import { DataSetReader } from "./dataset-reader";
import { SchemaReader } from "./schema-reader";
import { ViewContainerReader } from "./view-container-reader";
import { IObjectContext } from "../models/IObjectContext";
import { ITokenReader } from "../models/ITokenReader";
import TokenReader from "../token-reader";

export class ObjectReader {
  static read(content: string): IObjectContext {
    const context = this.getReadContext(content);
    const appObject = this.getContextInstance();

    appObject.header = ObjectReader.readHeader(context);
    this.readBody(context, appObject);
    appObject.footer = this.readFooter(context);

    return appObject;
  }

  private static readBody(
    tokenReader: ITokenReader,
    appObject: IObjectContext
  ) {
    let comments: string[] = [];

    let value = tokenReader.peekTokenValue().toLowerCase();

    while (value !== "}") {
      switch (value) {
        case "var":
          appObject.variables = VariablesReader.read(tokenReader);
          break;
        case "[":
        case "local":
        case "internal":
        case "procedure":
          appObject.procedures.push(FunctionReader.read(tokenReader, comments));
          comments = [];
          break;
        case "trigger":
          appObject.triggers.push(FunctionReader.read(tokenReader, comments));
          comments = [];
          break;
        // Table
        case "fields":
          appObject.fields = FieldsReader.read(tokenReader);
          break;
        // Page
        case "layout":
          appObject.layout = LayoutReader.read(tokenReader);
          break;
        case "views":
          appObject.views = ViewContainerReader.read(tokenReader);
          break;
        case "actions":
          appObject.actions = ActionContainerReader.read(tokenReader);
          break;
        // Report
        case "dataset":
          appObject.dataSet = DataSetReader.read(tokenReader);
          break;
        // XmlPort
        case "schema":
          appObject.schema = SchemaReader.read(tokenReader);
          break;
        // Table
        case "keys":
        case "fieldgroups":
        // Report
        case "requestpage":
        case "labels":
        // Report
        case "elements":
        // EnumExtension
        case "value":
          appObject.segments.push({
            name: value,
            tokens: this.readBracesSegment(tokenReader),
          });
          break;
        default:
          if (tokenReader.tokenType() === "comment") {
            comments.push(tokenReader.tokenValue());
          } else {
            comments.forEach((comment) => appObject.properties.push(comment));
            comments = [];
            appObject.properties.push(PropertyReader.read(tokenReader));
          }
          break;
      }

      tokenReader.readWhiteSpaces();
      value = tokenReader.peekTokenValue().toLowerCase();
    }
  }

  private static getReadContext(content: string): ITokenReader {
    return new TokenReader(Tokenizer.tokenizer(content));
  }

  private static getContextInstance(): IObjectContext {
    return {
      header: "",
      footer: "",
      variables: [],
      procedures: [],
      triggers: [],
      segments: [],
      properties: [],
    };
  }

  private static readHeader(tokenReader: ITokenReader): string {
    const tokens: Array<IToken> = [];
    while (tokenReader.peekTokenValue() !== "{") {
      tokens.push(tokenReader.token());
    }

    if (tokenReader.peekTokenValue() !== "{") {
      throw new Error("body begin error");
    }

    tokens.push(tokenReader.token());
    tokenReader.readWhiteSpaces();
    return Helper.tokensToString(tokens, Keywords.ObjectTypes);
  }

  private static readFooter(tokenReader: ITokenReader): string {
    const tokens: Array<IToken> = [];
    if (tokenReader.peekTokenValue() !== "}") {
      throw new Error("end body error");
    }

    tokens.push(tokenReader.token());
    tokenReader.readWhiteSpaces();
    return Helper.tokensToString(tokens, []);
  }

  private static readBracesSegment(tokenReader: ITokenReader): Array<IToken> {
    const tokens: Array<IToken> = [];
    let counter = 0;
    let value = tokenReader.peekTokenValue();
    while (value !== "}" || counter !== 0) {
      tokens.push(tokenReader.token());

      value = tokenReader.peekTokenValue();
      if (value === "{") {
        counter++;
      } else if (value === "}") {
        counter--;
      }
    }

    if (tokenReader.peekTokenValue() !== "}" || counter !== 0) {
      throw new Error("segment end error.");
    }

    tokens.push(tokenReader.token());
    tokenReader.readWhiteSpaces();
    return tokens;
  }
}
