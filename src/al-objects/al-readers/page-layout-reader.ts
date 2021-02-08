import {
  PAGE_LAYOUT,
} from "../constants";
import ITokenReader from "../../tokenizers/models/token-reader.model";
import IPageLayout from "../components/models/page-layout.model";
import ControlReader from "./control-reader";
import PageLayout from "../components/page-layout";
import EXTENSION_KEYWORDS from "../maps/extension-keywords";
import PAGE_CONTROL_TYPES from "../maps/page-control-types";

export default class PageLayoutReader {
  static read(tokenReader: ITokenReader): IPageLayout {
    const layout = new PageLayout();
    layout.keyword = this.getKeyword(tokenReader);
    layout.postLabelComments = tokenReader.readComments();
    this.readBody(tokenReader, layout);

    return layout;
  }

  private static readBody(tokenReader: ITokenReader, layout: IPageLayout) {
    tokenReader.test("{", "Syntax error at layout body, '{' expected.");

    layout.comments = tokenReader.readComments();
    tokenReader.readWhiteSpaces();

    let value = tokenReader.peekTokenValue().toLowerCase();
    while (
      PAGE_CONTROL_TYPES.hasItem(value) ||
      EXTENSION_KEYWORDS.hasItem(value)
    ) {
      layout.controls.push(ControlReader.read(tokenReader));
      value = tokenReader.peekTokenValue().toLowerCase();
    }

    tokenReader.test("}", "Syntax error at layout body, '}' expected.");
  }

  private static getKeyword(tokenReader: ITokenReader) {
    let name = tokenReader.tokenValue().toLowerCase();
    if (name !== PAGE_LAYOUT) {
      throw new Error(`Invalid layout keyword '${name}'.`);
    }

    tokenReader.readWhiteSpaces();

    return name;
  }
}
