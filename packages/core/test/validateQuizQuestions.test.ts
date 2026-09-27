import { describe, expect, it } from 'vitest';
import { isErr, isOk, validateQuizQuestions } from '../src/index';
import type { QuizProviderRequest } from '../src/index';

function request(size = 2): QuizProviderRequest {
  return {
    title: 'Book',
    pages: [
      { page: 1, text: 'Once upon a time.' },
      { page: 2, text: 'The end.' },
    ],
    size,
  };
}

const validTrueFalse = {
  type: 'true_false',
  prompt: 'The story starts with "Once upon a time."',
  options: ['True', 'False'],
  correctIndex: 0,
  explanation: 'Page 1 opens with that line.',
  sourcePage: 1,
};

const validMultipleChoice = {
  type: 'multiple_choice',
  prompt: 'How does the story end?',
  options: ['The end.', 'To be continued.', 'Happily ever after.', 'The beginning.'],
  correctIndex: 0,
  explanation: 'Page 2 says "The end."',
  sourcePage: 2,
};

describe('validateQuizQuestions', () => {
  it('accepts a well-formed mix of true/false and multiple-choice questions', () => {
    const result = validateQuizQuestions([validTrueFalse, validMultipleChoice], request(2));
    expect(isOk(result)).toBe(true);
  });

  it('rejects a response that is not an array', () => {
    const result = validateQuizQuestions({ questions: [validTrueFalse] }, request(1));
    expect(isErr(result) && result.error.kind).toBe('malformed');
  });

  it('rejects the wrong question count', () => {
    const result = validateQuizQuestions([validTrueFalse], request(2));
    expect(isErr(result) && result.error.detail).toMatch(/expected 2 questions, got 1/);
  });

  it('rejects a partial response missing required fields', () => {
    const partial = { type: 'true_false', prompt: 'p', options: ['True', 'False'] };
    const result = validateQuizQuestions([partial], request(1));
    expect(isErr(result) && result.error.kind).toBe('malformed');
  });

  it('rejects a true/false question without exactly two options', () => {
    const malformed = { ...validTrueFalse, options: ['True', 'False', 'Maybe'] };
    const result = validateQuizQuestions([malformed], request(1));
    expect(isErr(result)).toBe(true);
  });

  it('rejects a multiple-choice question without exactly four options', () => {
    const malformed = { ...validMultipleChoice, options: ['A', 'B'] };
    const result = validateQuizQuestions([malformed], request(1));
    expect(isErr(result)).toBe(true);
  });

  it('rejects a correctIndex out of range', () => {
    const malformed = { ...validTrueFalse, correctIndex: 5 };
    const result = validateQuizQuestions([malformed], request(1));
    expect(isErr(result)).toBe(true);
  });

  it('rejects a sourcePage that was not part of the request', () => {
    const malformed = { ...validTrueFalse, sourcePage: 99 };
    const result = validateQuizQuestions([malformed], request(1));
    expect(isErr(result)).toBe(true);
  });

  it('rejects an unknown question type', () => {
    const malformed = { ...validTrueFalse, type: 'essay' };
    const result = validateQuizQuestions([malformed], request(1));
    expect(isErr(result)).toBe(true);
  });
});
