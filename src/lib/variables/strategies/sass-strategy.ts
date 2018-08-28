import VariablesExtractor, { IVariableStrategy } from '../variables-extractor';
import { DocumentLine, LineExtraction, flattenLineExtractionsFlatten } from '../../util/color-util';
import Variable from '../variable';
import Color from '../../colors/color';
import VariablesStore from '../variable-store';
import ColorExtractor from '../../colors/color-extractor';
import { EOL } from '../../util/regexp';

export const REGEXP = new RegExp(`(\\$(?:[_a-z]+[\\-_a-z\\d]*)(?!:))${EOL}`, 'gi');
export const REGEXP_ONE = new RegExp(`^(\\$(?:[_a-z]+[\\-_a-z\\d]*)(?!:))${EOL}`, 'i');
export const DECLARATION_REGEXP = new RegExp(`(?:(\\$(?:[_a-z]+[\\-_a-z\\d]*)\\s*):)${EOL}`, 'gi');

/** @see http://sass-lang.com/documentation/Sass/Script/Functions.html */
export const FUNCTION_REGEXP = /((?:rgb|hsl)[a]?\((.*)\))(?:$|"|'|,| |;|\)|\r|\n)/gi;

class SassExtractor implements IVariableStrategy {
  name: string = 'SASS';
  private store: VariablesStore = new VariablesStore();

  public extractDeclarations(fileName: string, fileLines: DocumentLine[]): number {
    return fileLines.map(({text, line}) => this.__extractDeclarations(fileName, text, line)).length;
  }
  public __extractDeclarations(fileName: string, text: string, line: number) {
    const e = this.extractFunction(fileName, [{line, text}])[0];
    text = e.text;

    let match = null;
    while ((match = DECLARATION_REGEXP.exec(text)) !== null) {
      const varName = (match[1] || match[2]).trim();
      const raw = text.slice(match.index + match[0].length).trim();

      let color = ColorExtractor.extractOneColor(raw) || this.extractVariable(fileName, raw) || new Color('', 0, [], 0, raw.replace(new RegExp(';', 'g'), ''));
      if (this.store.has(varName, fileName, line)) {
        const decoration = this.store.findDeclaration(varName, fileName, line);
        decoration.update(<Color>color);
      } else {
        const variable = new Variable(varName, <Color> color, {fileName, line});
        this.store.addEntry(varName, variable); // update entry??
      }
    }
  }
  extractVariables(fileName: string, fileLines: DocumentLine[]): LineExtraction[] {
    this.extractFunction(fileName, fileLines);
    return this._extractVariables(fileName, fileLines);
  }
  _extractVariables(fileName: string, fileLines: DocumentLine[]): LineExtraction[] {
    const variables = fileLines.map(({line, text}) => {
      let match = null;
      let colors: Variable[] = [];
      while ((match = REGEXP.exec(text)) !== null) {
        let varName =  match[1];
        varName = varName.trim();
        if (this.store.has(varName)) {
          let decoration = this.store.findClosestDeclaration(varName, fileName);
          if (decoration.color === undefined) {
            decoration = this.store.findClosestDeclaration(varName, '.');
          }
          let variable;
          const declaration = null;
          if (decoration.color) {
            variable = new Variable(varName, new Color(varName, match.index, decoration.color.rgb, decoration.color.alpha, decoration.color.raw), declaration);
          } else {
            variable = new Variable(varName, new Color(varName, match.index, null), declaration);
          }
          colors.push(variable);
        }
      }
      return {line, colors};
    });
    return flattenLineExtractionsFlatten(variables);
  }
  extractVariable(fileName: string, text: string): Color | undefined {
    let match: RegExpMatchArray = text.match(REGEXP_ONE);
    let variable;
    if (match) {
      variable = this.store.findClosestDeclaration(match[1], fileName);
    }
    return variable ? variable.color : undefined;
  }

  extractFunction(fileName: string, fileLines: DocumentLine[]) {
    return fileLines.map(({line, text}) => {
      let match = null;
      let colors: Variable[] = [];
      while ((match = FUNCTION_REGEXP.exec(text)) !== null) {
        const variables = this._extractVariables(fileName, [{line, text: match[2]}]);
        // console.log(variables)
        if (variables.length > 0) {
          const { colors } = variables[0];
          const value = colors.reduce((vp: string[], vc: Variable) => {
            vp.push(vc.color.raw);
            return vp;
          }, []).join(',');
          text = text.replace(match[2], value);
        }
      }
      return {line, text};
    });
  }

  variablesCount() {
    return this.store.count;
  }
  deleteVariable(fileName: string, line: number) {
    return this.store.delete(null, fileName, line);
  }
}

VariablesExtractor.registerStrategy(new SassExtractor());
export default SassExtractor;
