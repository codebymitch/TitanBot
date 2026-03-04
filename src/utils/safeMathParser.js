const SUPPORTED_FUNCTIONS = Object.freeze({
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  log: Math.log,
  log10: Math.log10,
  exp: Math.exp
});

const SUPPORTED_CONSTANTS = Object.freeze({
  pi: Math.PI,
  e: Math.E
});

const OPERATOR_PRECEDENCE = Object.freeze({
  'u-': 5,
  '^': 4,
  '*': 3,
  '/': 3,
  '%': 3,
  '+': 2,
  '-': 2
});

const RIGHT_ASSOCIATIVE_OPERATORS = new Set(['^', 'u-']);

function normalizeExpression(input) {
  if (typeof input !== 'string') {
    throw new Error('Expression must be a string');
  }

  return input
    .trim()
    .toLowerCase()
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, 'pi')
    .replace(/√/g, 'sqrt');
}

function preprocessDegrees(expression) {
  return expression.replace(/(\d+(?:\.\d+)?)\s*deg\b/g, '($1*pi/180)');
}

function isDigit(character) {
  return character >= '0' && character <= '9';
}

function isAlpha(character) {
  return (character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z') || character === '_';
}

function tokenize(expression) {
  const tokens = [];
  let index = 0;

  while (index < expression.length) {
    const character = expression[index];

    if (character === ' ' || character === '\t' || character === '\n') {
      index += 1;
      continue;
    }

    if (isDigit(character) || character === '.') {
      let numberText = '';
      let dotCount = 0;

      while (index < expression.length) {
        const current = expression[index];
        if (!isDigit(current) && current !== '.') {
          break;
        }

        if (current === '.') {
          dotCount += 1;
          if (dotCount > 1) {
            throw new Error('Invalid number format');
          }
        }

        numberText += current;
        index += 1;
      }

      if (numberText === '.' || numberText.length === 0) {
        throw new Error('Invalid number format');
      }

      tokens.push({ type: 'number', value: Number(numberText) });
      continue;
    }

    if (isAlpha(character)) {
      let identifier = '';
      while (index < expression.length && isAlpha(expression[index])) {
        identifier += expression[index];
        index += 1;
      }

      if (Object.prototype.hasOwnProperty.call(SUPPORTED_CONSTANTS, identifier)) {
        tokens.push({ type: 'number', value: SUPPORTED_CONSTANTS[identifier] });
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(SUPPORTED_FUNCTIONS, identifier)) {
        tokens.push({ type: 'function', value: identifier });
        continue;
      }

      throw new Error(`Unsupported token: ${identifier}`);
    }

    if ('+-*/%^()'.includes(character)) {
      if (character === '(') {
        tokens.push({ type: 'leftParen', value: character });
      } else if (character === ')') {
        tokens.push({ type: 'rightParen', value: character });
      } else {
        tokens.push({ type: 'operator', value: character });
      }

      index += 1;
      continue;
    }

    throw new Error(`Unsupported character: ${character}`);
  }

  return tokens;
}

function toRpn(tokens) {
  const output = [];
  const stack = [];
  let previousTokenType = null;

  for (const token of tokens) {
    if (token.type === 'number') {
      output.push(token);
      previousTokenType = 'number';
      continue;
    }

    if (token.type === 'function') {
      stack.push(token);
      previousTokenType = 'function';
      continue;
    }

    if (token.type === 'operator') {
      let operatorValue = token.value;

      if (operatorValue === '-' && (previousTokenType === null || previousTokenType === 'operator' || previousTokenType === 'leftParen' || previousTokenType === 'function')) {
        operatorValue = 'u-';
      }

      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.type !== 'operator') {
          break;
        }

        const currentPrecedence = OPERATOR_PRECEDENCE[operatorValue];
        const topPrecedence = OPERATOR_PRECEDENCE[top.value];
        const isRightAssociative = RIGHT_ASSOCIATIVE_OPERATORS.has(operatorValue);

        if ((isRightAssociative && currentPrecedence < topPrecedence) || (!isRightAssociative && currentPrecedence <= topPrecedence)) {
          output.push(stack.pop());
        } else {
          break;
        }
      }

      stack.push({ type: 'operator', value: operatorValue });
      previousTokenType = 'operator';
      continue;
    }

    if (token.type === 'leftParen') {
      stack.push(token);
      previousTokenType = 'leftParen';
      continue;
    }

    if (token.type === 'rightParen') {
      let hasOpeningParen = false;

      while (stack.length > 0) {
        const top = stack.pop();
        if (top.type === 'leftParen') {
          hasOpeningParen = true;
          break;
        }

        output.push(top);
      }

      if (!hasOpeningParen) {
        throw new Error('Mismatched parentheses');
      }

      if (stack.length > 0 && stack[stack.length - 1].type === 'function') {
        output.push(stack.pop());
      }

      previousTokenType = 'rightParen';
    }
  }

  while (stack.length > 0) {
    const top = stack.pop();
    if (top.type === 'leftParen' || top.type === 'rightParen') {
      throw new Error('Mismatched parentheses');
    }
    output.push(top);
  }

  return output;
}

function evaluateRpn(rpnTokens) {
  const stack = [];

  for (const token of rpnTokens) {
    if (token.type === 'number') {
      stack.push(token.value);
      continue;
    }

    if (token.type === 'operator') {
      if (token.value === 'u-') {
        if (stack.length < 1) {
          throw new Error('Invalid expression');
        }
        stack.push(-stack.pop());
        continue;
      }

      if (stack.length < 2) {
        throw new Error('Invalid expression');
      }

      const right = stack.pop();
      const left = stack.pop();

      if (token.value === '+') stack.push(left + right);
      else if (token.value === '-') stack.push(left - right);
      else if (token.value === '*') stack.push(left * right);
      else if (token.value === '/') stack.push(left / right);
      else if (token.value === '%') stack.push(left % right);
      else if (token.value === '^') stack.push(Math.pow(left, right));
      else throw new Error(`Unsupported operator: ${token.value}`);

      continue;
    }

    if (token.type === 'function') {
      if (stack.length < 1) {
        throw new Error('Invalid function usage');
      }

      const value = stack.pop();
      const handler = SUPPORTED_FUNCTIONS[token.value];
      if (!handler) {
        throw new Error(`Unsupported function: ${token.value}`);
      }
      stack.push(handler(value));
      continue;
    }
  }

  if (stack.length !== 1) {
    throw new Error('Invalid expression');
  }

  return stack[0];
}

export function evaluateMathExpression(expression) {
  const normalized = preprocessDegrees(normalizeExpression(expression));
  const tokens = tokenize(normalized);
  const rpn = toRpn(tokens);
  const value = evaluateRpn(rpn);

  if (!Number.isFinite(value)) {
    throw new Error('Expression result is not finite');
  }

  return value;
}
