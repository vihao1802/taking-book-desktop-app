import { useEffect, useMemo, useRef, useState } from 'react';
import { isOk } from '@taking-book/core';
import type { QuizSize } from '@taking-book/core';
import type { BookFile, Quiz, QuizAttempt } from '../../shared/types';
import { initQuizFlow, isFinished, nextQuestion, revealAnswer, selectOption, type QuizFlowState } from './quizFlow';
import { defaultScopeChoice, widenScopeChoice, type QuizScopeChoice } from './quizScopeChoice';
import { defaultSizeChoice, isSizeChoice } from './quizSizeChoice';
import { useQuizScopeText } from './useQuizScopeText';

/** Which screen the Quiz dialog is showing. */
export type QuizPhase = 'setup' | 'generating' | 'error' | 'question' | 'submitting' | 'score';

export interface QuizSessionState {
  phase: QuizPhase;
  /** The default/widened scope shown in setup, and used once the reader starts. */
  scope: QuizScopeChoice;
  size: QuizSize;
  error: string | null;
  flow: QuizFlowState | null;
  attempt: QuizAttempt | null;
}

export interface QuizSessionActions {
  setSize(size: number): void;
  widenStart(startPage: number): void;
  start(): void;
  selectAnswer(optionIndex: number): void;
  reveal(): void;
  next(): void;
  retake(): void;
  close(): void;
}

/**
 * Drives the Quiz dialog end to end: the setup screen's scope/size choice,
 * generating and storing the Quiz over IPC (extracting the scope's page text
 * itself, since Quiz starts outside the reader), the one-question-at-a-time
 * flow, and submitting the finished attempt. `onClose` is called from `close`
 * so the caller can dismiss the dialog.
 */
export function useQuizSession(file: BookFile, onClose: () => void): [QuizSessionState, QuizSessionActions] {
  const lastPage = file.lastPage ?? 0;
  const [phase, setPhase] = useState<QuizPhase>('setup');
  const [scope, setScope] = useState<QuizScopeChoice>(() => defaultScopeChoice(lastPage));
  const [size, setSizeState] = useState<QuizSize>(defaultSizeChoice);
  const [error, setError] = useState<string | null>(null);
  const [flow, setFlow] = useState<QuizFlowState | null>(null);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);

  // Text is only extracted once the reader starts, and only for the scope
  // they chose — never the whole book they have read so far.
  const [extractRange, setExtractRange] = useState<{ start: number; end: number } | null>(null);
  const scopeText = useQuizScopeText(extractRange ? file.path : null, extractRange?.start ?? 0, extractRange?.end ?? 0);

  useEffect(() => {
    if (phase !== 'generating' || !extractRange || !scopeText.settled) return;
    if (scopeText.error) {
      setError(scopeText.error);
      setPhase('error');
      return;
    }
    void (async () => {
      const result = await window.api.generateQuiz({
        fileHash: file.hash,
        title: file.title,
        lastPage,
        scopeStartPage: extractRange.start,
        size,
        pages: scopeText.pages,
      });
      if (!isOk(result)) {
        setError(result.error);
        setPhase('error');
        return;
      }
      setQuiz(result.data);
      setFlow(initQuizFlow(result.data.questions));
      setPhase('question');
    })();
    // Deliberately keyed on the settled extraction rather than every value the
    // body reads (size, file.hash/title, lastPage): those only change together
    // with a fresh `extractRange` from `start()`, and re-running on every
    // render would re-generate (and re-store) the same Quiz repeatedly.
  }, [phase, extractRange, scopeText.settled, scopeText.error, scopeText.pages]);

  // Submits the finished attempt as its own effect, not as a side effect of
  // `next()`'s state update: React may invoke a state updater more than once
  // (Strict Mode, a replayed update), and a side-effecting IPC write does not
  // belong there. `submittedRef` keeps this to exactly one submission per Quiz.
  const submittedRef = useRef(false);
  useEffect(() => {
    if (phase !== 'question' || !flow || !isFinished(flow) || !quiz || submittedRef.current) return;
    submittedRef.current = true;
    setPhase('submitting');
    void (async () => {
      const result = await window.api.submitQuizAttempt(quiz.id, file.hash, flow.answers);
      if (isOk(result)) {
        setAttempt(result.data);
      } else {
        console.error(`quiz: failed to save the attempt for ${file.hash}: ${result.error}`);
        setError(result.error);
      }
      setPhase('score');
    })();
  }, [phase, flow, quiz, file.hash]);

  const actions = useMemo<QuizSessionActions>(
    () => ({
      setSize(size) {
        if (isSizeChoice(size)) setSizeState(size);
      },
      widenStart(startPage) {
        setScope(widenScopeChoice(lastPage, startPage));
      },
      start() {
        if (lastPage < 1) {
          setError('This book has no read progress yet, so a Quiz cannot be made.');
          setPhase('error');
          return;
        }
        setError(null);
        setExtractRange({ start: scope.startPage, end: scope.endPage });
        setPhase('generating');
      },
      selectAnswer(optionIndex) {
        setFlow((current) => (current ? selectOption(current, optionIndex) : current));
      },
      reveal() {
        setFlow((current) => (current ? revealAnswer(current) : current));
      },
      next() {
        setFlow((current) => (current ? nextQuestion(current) : current));
      },
      retake() {
        submittedRef.current = false;
        setPhase('setup');
        setError(null);
        setFlow(null);
        setAttempt(null);
        setQuiz(null);
        setExtractRange(null);
      },
      close: onClose,
    }),
    [lastPage, scope, onClose],
  );

  return [{ phase, scope, size, error, flow, attempt }, actions];
}
