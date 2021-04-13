import * as Excel from "exceljs";
import * as vscode from "vscode";
import fs = require("fs");
import _ = require("lodash");
import { languages } from "vscode";
import IDiagnosticTooltipProblem from "./models/diagnostic-tooltip-problem.model";
import ObjectReader from "../al-objects/al-readers/object-reader";
import CodeIndex from "../al-objects/code-index";
import ICodeIndex from "../al-objects/models/code-index.model";
import IObjectContext from "../al-objects/components/models/object-context.model";
import ALPackage from "../al-packages/al-package";
import IALPackage from "../al-packages/models/al-package.model";
import StringHelper from "../helpers/string-helper";
import ALPackageHelper from "../al-packages/al-package-helper";
import { SymbolReferences } from "../al-packages/models/symbol-reference.model";
import ObjectWriter from "../al-objects/formatters/object-writer";
import IFormatSetting from "../helpers/models/format-settings.model";
import { ObjectHelper } from "../al-objects/object-helper";
import { WorkspaceHelper } from "../helpers/workspace-helper";

export class Tooltips {
  private static readonly TooltipRuleCode: string = "AA0218";
  private static readonly tooltipHeaders = [
    { header: "File", key: "file" },
    { header: "Type", key: "type" },
    { header: "Name", key: "name" },
    { header: "Caption", key: "caption" },
    { header: "Dutch Caption", key: "dutchCaption" },
  ];

  static exportMissingTooltips() {
    try {
      const dataSet: IDiagnosticTooltipProblem[] = [];
      const wsFolders = WorkspaceHelper.getWorkSpaceFolders();
      const translations = ALPackage.getTranslations(wsFolders);
      const packages = ALPackage.getALPackagesFromSymbols(wsFolders);

      const problems = languages.getDiagnostics();
      for (const [fileUri, diagnostics] of problems) {
        let filePath = fileUri.fsPath;
        for (const folder of wsFolders) {
          filePath = filePath.replace(folder, "");
        }

        if (filePath.startsWith("\\") || filePath.startsWith("/")) {
          filePath = filePath.substring(1);
        }

        const tooltipDiagnostics = diagnostics.filter(
          (i) => i.code === Tooltips.TooltipRuleCode
        );
        if (tooltipDiagnostics.length === 0) {
          continue;
        }

        const data = fs.readFileSync(fileUri.fsPath);
        const content = data.toString();
        const codeIndex: ICodeIndex = new CodeIndex();
        let objectContent: IObjectContext = ObjectReader.read(
          content,
          codeIndex
        );

        const msgExpr = /The Tooltip property for (PageField|PageAction) (.*) must be filled./;
        for (const diagnostic of tooltipDiagnostics) {
          const match = msgExpr.exec(diagnostic.message) || ["", ""];
          const type = match[1];
          const name = match[2];
          let caption: string = "";
          let dutchCaption: string = "";

          switch (type) {
            case "PageField":
              caption = Tooltips.getFieldCaption(packages, objectContent, name);
              break;
            case "PageAction":
              caption = Tooltips.getActionCaption(objectContent, name);
              break;
          }

          if (caption) {
            const translation = translations.find(
              (p) =>
                p.source &&
                (p.source + "").toLowerCase() === caption.toLowerCase()
            );
            if (translation) {
              dutchCaption = translation.target;
            }
          }

          dataSet.push({
            file: filePath,
            code: diagnostic.code + "",
            type: type,
            name: name,
            caption: caption,
            dutchCaption: dutchCaption,
            startLineNo: diagnostic.range.start.line,
            endLineNo: diagnostic.range.end.line,
            startPosition: diagnostic.range.start.character,
            endPosition: diagnostic.range.end.character,
            severity: "",
          });
        }
      }

      Tooltips.exportTooltipsToExcel(dataSet, wsFolders[0]);
    } catch (err) {
      vscode.window.showErrorMessage(
        `Export missing tooltips failed.\n\n${err}`
      );
    }
  }

  static importMissingTooltips() {
    try {
      if (!vscode.workspace.workspaceFolders) {
        return;
      }

      const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
      const filename = workspaceFolder + "\\.vscode\\Tooltips.xlsx";

      Tooltips.getTooltipsData(filename).then((data) => {
        try {
          const tooltipsData = _.groupBy(data, (p) => p.file);
          for (const file in tooltipsData) {
            const fullPath = workspaceFolder + "\\" + file;
            const newContent = Tooltips.updateTooltips(
              fullPath,
              tooltipsData[file]
            );
            fs.writeFileSync(fullPath, newContent);
          }

          vscode.window.showInformationMessage(
            "Missing tooltips imported successfully."
          );
        } catch (err) {
          vscode.window.showErrorMessage(
            `Import missing tooltips failed.\n\n${err}`
          );
        }
      });
    } catch (err) {
      vscode.window.showErrorMessage(
        `Import missing tooltips failed.\n\n${err}`
      );
    }
  }

  private static updateTooltips(
    file: string,
    data: IDiagnosticTooltipProblem[]
  ) {
    const buffer = fs.readFileSync(file);
    const content = buffer.toString();
    const codeIndex: ICodeIndex = new CodeIndex();
    const objectContent: IObjectContext = ObjectReader.read(content, codeIndex);

    data.forEach((diagnostic) => {
      switch (diagnostic.type) {
        case "PageField":
          if (objectContent.layout) {
            const control = ObjectHelper.findInControls(
              objectContent.layout.controls,
              diagnostic.name
            );
            if (control) {
              control.properties.push({
                name: "Tooltip",
                property: `Tooltip = '${diagnostic.caption}';`,
              });
            }
          }
          break;
        case "PageAction":
          if (objectContent.actionsContainer) {
            const action = ObjectHelper.findInActions(
              objectContent.actionsContainer.actions,
              diagnostic.name
            );
            if (action) {
              action.properties.push({
                name: "Tooltip",
                property: `Tooltip = '${diagnostic.caption}';`,
              });
            }
          }
          break;
      }
    });

    const settings: IFormatSetting = {
      renameFileNameOnSave: false,
      wrapProcedure: false,
      sortVariables: false,
      sortProcedures: false,
      convertKeywordsToAL: false,
      appendParenthesisAfterProcedures: false,
      removeUnusedLocalProcedures: false,
      removeUnusedLocalVariables: false,
      removeUnusedGlobalVariables: false,
      removeUnusedParameters: false,
      autoCorrectVariableNames: false,
      setDefaultApplicationArea: false,
      setDefaultDataClassification: false,
      qualifyWithRecPrefix: false,
      extensionFunctions: {},
    };

    return ObjectWriter.write(objectContent, settings, codeIndex);
  }

  private static getActionCaption(
    objectContent: IObjectContext,
    name: string
  ): string {
    if (
      !objectContent.actionsContainer ||
      !objectContent.actionsContainer.actions
    ) {
      return "";
    }

    const action = ObjectHelper.findInActions(
      objectContent.actionsContainer.actions,
      name
    );
    if (action) {
      const caption = action.properties.find(
        (c) => c.name.toLowerCase() === "caption"
      );
      if (caption) {
        const captionExpr = /Caption\s?=\s?'(.*)'\s*;/i;
        const match = captionExpr.exec(caption.property);
        if (match) {
          return match[1];
        }
      }
    }

    return "";
  }

  private static getFieldCaption(
    packages: IALPackage[],
    objectContent: IObjectContext,
    name: string
  ): string {
    if (!objectContent.layout || !objectContent.layout.controls) {
      return "";
    }

    const control = ObjectHelper.findInControls(
      objectContent.layout.controls,
      name
    );
    if (!control) {
      throw new Error("Control not found");
    }

    const caption = control.properties.find(
      (c) => c.name.toLowerCase() === "caption"
    );
    if (caption) {
      const captionExpr = /Caption\s?=\s?'(.*)'\s*;/i;
      const match = captionExpr.exec(caption.property);
      if (!match) {
        throw new Error("Caption Expression Error");
      }

      return match[1];
    } else {
      // get caption from base object
      let page: SymbolReferences.Page | undefined;
      let sourceTable = "";
      switch (objectContent.declaration.type.toLowerCase()) {
        case "pageextension":
          page = ALPackageHelper.findPage(
            packages,
            objectContent.declaration.baseObject
          );
          break;
        case "page":
          page = ALPackageHelper.findPage(
            packages,
            objectContent.declaration.id
          );
          break;
      }

      if (!page) {
        throw new Error("Page not found");
      }

      sourceTable =
        page.Properties.find((p) => p.Name === "SourceTable")?.Value || "";

      if (!sourceTable) {
        throw new Error("SourceTable not found");
      }

      const fieldName = StringHelper.removeQuotes(control.sourceExpr);
      const table = ALPackageHelper.findTable(packages, sourceTable);
      if (!table) {
        throw new Error("Table not found");
      }

      let field = table.Fields.find((p) => p.Name === fieldName);
      if (!field) {
        const fields = ALPackageHelper.findTableExtensionFields(
          packages,
          table.Name
        );
        field = fields?.find((p) => p.Name === fieldName);
        if (!field) {
          // this should be variable or function or expression
          return "";
        }
      }

      const caption = field.Properties?.find((p) => p.Name === "Caption");
      if (!caption) {
        return "";
      }

      return caption.Value;
    }
  }

  private static exportTooltipsToExcel(
    dataSet: IDiagnosticTooltipProblem[],
    basePath: string
  ) {
    let workbook = new Excel.Workbook();
    Tooltips.exportTooltipsData(workbook, dataSet);

    const fileName = `${basePath}\\.vscode\\MissingTooltips.xlsx`;
    workbook.xlsx
      .writeFile(fileName)
      .then(() => {
        vscode.window.showInformationMessage(
          `Missing Tooltips exported to ${fileName}`
        );
      })
      .catch((r) => {
        vscode.window.showErrorMessage(
          `An error occurred while exporting missing tooltips.\n\n${r.message}"`
        );
      });
  }

  private static exportTooltipsData(
    workbook: Excel.Workbook,
    dataSet: IDiagnosticTooltipProblem[]
  ) {
    let worksheet = workbook.addWorksheet("Tooltips");

    worksheet.columns = Tooltips.tooltipHeaders as any;

    worksheet.columns[0].width = 50;
    worksheet.columns[1].width = 10;
    worksheet.columns[2].width = 30;
    worksheet.columns[3].width = 50;
    worksheet.columns[3].width = 50;
    worksheet.addRows(dataSet);

    Tooltips.formatHeader(worksheet);
  }

  private static formatHeader(worksheet: Excel.Worksheet) {
    const header = worksheet.getRow(1);
    for (var i = 1; i <= worksheet.columns.length; i++) {
      const cell = header.getCell(i);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "cccccc" },
      };

      cell.font = { bold: true };
    }
  }

  private static getTooltipsData(
    filename: string
  ): Promise<IDiagnosticTooltipProblem[]> {
    return new Promise<IDiagnosticTooltipProblem[]>((resolve, reject) => {
      const data: IDiagnosticTooltipProblem[] = [];
      let header: boolean = true;
      const workbook = new Excel.Workbook();
      workbook.xlsx.readFile(filename).then(function () {
        var worksheet = workbook.getWorksheet("Tooltips");
        worksheet.eachRow({ includeEmpty: true }, function (row, rowNumber) {
          if (header) {
            header = false;
            return;
          }

          data.push({
            file: row.getCell(1).value?.toString() || "",
            type: row.getCell(2).value?.toString() || "",
            name: row.getCell(3).value?.toString() || "",
            caption: row.getCell(4).value?.toString() || "",
            dutchCaption: row.getCell(5).value?.toString() || "",
            startLineNo: 0,
            endLineNo: 0,
            startPosition: 0,
            endPosition: 0,
            code: "",
            severity: "",
          });
        });

        resolve(data);
      });
    });
  }
}
