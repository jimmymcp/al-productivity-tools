import ViewContainer from "../components/view-container";
import ITokenReader from "../../tokenizers/models/token-reader.model";
import IViewContainer from "../components/models/view-container.model";
import ViewReader from "./view-reader";

export default class ViewContainerReader {
  static read(tokenReader: ITokenReader): IViewContainer {
    const container: IViewContainer = new ViewContainer();

    this.getLabel(tokenReader);
    container.postLabelComments = tokenReader.readComments();
    this.readBody(tokenReader, container);

    return container;
  }

  private static readBody(
    tokenReader: ITokenReader,
    container: IViewContainer
  ) {
    tokenReader.test("{", `Syntax error at views body, '{' expected.`);

    container.comments = tokenReader.readComments();

    let value = tokenReader.peekTokenValue().toLowerCase();
    while (value === "view") {
      container.views.push(ViewReader.read(tokenReader));
      value = tokenReader.peekTokenValue().toLowerCase();
    }

    tokenReader.test("}", `Syntax error at views body, '}' expected.`);
  }

  private static getLabel(tokenReader: ITokenReader) {
    let label = tokenReader.tokenValue();
    if (label.toLowerCase() !== "views") {
      throw new Error(`Invalid view container type '${label}'.`);
    }

    tokenReader.readWhiteSpaces();

    return label;
  }
}
