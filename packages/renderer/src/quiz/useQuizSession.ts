import { useEffect, useMemo, useRef, useState } from 'react';
import { isOk } from '@taking-book/core';
import type { QuizSize } from '@taking-book/core';
import type { BookFile, Quiz, QuizAttempt } from '@/reader-api';
import { initQuizFlow, isFinished, nextQuestion, revealAnswer, selectOption, type QuizFlowState } from './quizFlow';
import {
  beginReview,
  closeReview,
  historyFailed,
  historyLoading,
  historyReady,
  initialHistory,
  reviewFailed,
  reviewReady,
  type QuizHistoryState,
} from './quizHistory';
import {
  applyQuizPrivacyAction,
  quizPrivacyNoticeGate,
} from './quizPrivacyNotice';
import { defaultScopeChoice, widenScopeChoice, type QuizScopeChoice } from './quizScopeChoice';
import { defaultSizeChoice, isSizeChoice } from './quizSizeChoice';
import { useQuizScopeText } from './useQuizScopeText';

/** Which screen the Quiz dialog is showing. */
export type QuizPhase =
  | 'setup'
  | 'privacy'
  | 'generating'
  | 'error'
  | 'question'
  | 'submitting'
  | 'score'
  | 'history'
  | 'review';

export interface QuizSessionState {
  phase: QuizPhase;
  /** The default/widened scope shown in setup, and used once the reader starts. */
  scope: QuizScopeChoice;
  size: QuizSize;
  error: string | null;
  flow: QuizFlowState | null;
  attempt: QuizAttempt | null;
  /** The attempt-history list and the review it can open. */
  history: QuizHistoryState;
}

export interface QuizSessionActions {
  setSize(size: number): void;
  widenStart(startPage: number): void;
  start(): void;
  /** The reader accepted the one-time privacy notice; it is remembered and the Quiz proceeds. */
  acceptPrivacyNotice(): void;
  /** The reader declined the privacy notice; nothing is generated and they return to setup. */
  declinePrivacyNotice(): void;
  selectAnswer(optionIndex: number): void;
  reveal(): void;
  next(): void;
  retake(): void;
  /** Restarts the finished Quiz with the same saved questions; no provider call, works offline. */
  retakeSame(): void;
  /** Asks the provider for a fresh set of questions and saves it, then restarts the Quiz. */
  retakeNew(): void;
  /** Opens the Book's attempt-history list, reloading it from the store. */
  openHistory(): void;
  /** Leaves the history list back to the setup screen. */
  backFromHistory(): void;
  /** Opens the review of one attempt's missed questions. */
  beginReview(attempt: QuizAttempt): void;
  /** Leaves the review back to the attempt-history list. */
  closeReview(): void;
  /** Opens the Book in the reader at the question's real PDF source page, closing the Quiz. */
  openSourcePage(page: number): void;
  close(): void;
}

/**
 * Drives the Quiz dialog end to end: the setup screen's scope/size choice,
 * generating and storing the Quiz over IPC (extracting the scope's page text
 * itself, since Quiz starts outside the reader), the one-question-at-a-time
 * flow, and submitting the finished attempt. `onClose` is called from `close`
 * so the caller can dismiss the dialog; `onOpenAtPage` opens the Book in the
 * reader at a question's source page.
 */
export function useQuizSession(
  file: BookFile,
  onClose: () => void,
  onOpenAtPage: (page: number) => void,
): [QuizSessionState, QuizSessionActions] {
  const lastPage = file.lastPage ?? 0;
  const [phase, setPhase] = useState<QuizPhase>('setup');
  const [scope, setScope] = useState<QuizScopeChoice>(() => defaultScopeChoice(lastPage));
  const [size, setSizeState] = useState<QuizSize>(defaultSizeChoice);
  const [error, setError] = useState<string | null>(null);
  const [flow, setFlow] = useState<QuizFlowState | null>(null);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [history, setHistory] = useState<QuizHistoryState>(initialHistory);

  // True only for a Retake with new questions: the same scope and size, but the
  // provider is asked for a fresh set instead of reusing the saved questions.
  const [forceNew, setForceNew] = useState(false);

  // The action to resume once the reader accepts the one-time privacy notice
  // (ADR-0007): a fresh Quiz start or a Retake with new questions. A ref, not
  // state, because it only drives a transition decision, never the render.
  const pendingAfterPrivacyRef = useRef<(() => void) | null>(null);

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
        forceNew,
      });
      if (!isOk(result)) {
        setError(result.error);
        setPhase('error');
        return;
      }
      setQuiz(result.data);
      setFlow(initQuizFlow(result.data.questions));
      setPhase('question');
      setForceNew(false);
    })();
    // Deliberately keyed on the settled extraction rather than every value the
    // body reads (size, file.hash/title, lastPage, forceNew): those only change
    // together with a fresh `extractRange` from `start()` or `retakeNew()`, and
    // re-running on every render would re-generate (and re-store) the same Quiz
    // repeatedly.
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

  // Loads the Book's attempt list whenever the history screen is opened. The
  // status guard means the fetch runs once per open (`openHistory()` resets it
  // to loading so the list is always fresh after a new attempt; landing here
  // from a review that was started on the score screen leaves it idle).
  useEffect(() => {
    if (phase !== 'history' || (history.status !== 'loading' && history.status !== 'idle')) return;
    void (async () => {
      const result = await window.api.listQuizAttempts(file.hash);
      setHistory(isOk(result) ? historyReady(history, result.data) : historyFailed(history, result.error));
    })();
  }, [phase, history, file.hash]);

  // Loads the attempt's Quiz when a review is opened, then derives the missed
  // questions from it in core (`missedQuestions`).
  useEffect(() => {
    if (phase !== 'review' || !history.review || history.review.status !== 'loading') return;
    const attempt = history.review.attempt;
    void (async () => {
      const result = await window.api.getQuiz(attempt.quizId);
      setHistory(isOk(result) ? reviewReady(history, result.data) : reviewFailed(history, result.error));
    })();
  }, [phase, history, file.hash]);

  const actions = useMemo<QuizSessionActions>(
    () => {
      function failPrivacyGate(logDetail: string, message: string): void {
        console.error(logDetail);
        setError(message);
        setPhase('error');
      }

      // A Quiz that would call the provider (a start or a Retake with new
      // questions) shows the one-time privacy notice first unless it was
      // acknowledged on this device (ADR-0007); declining sends nothing.
      // `pending` runs once the reader has acknowledged — either now, or after
      // they accept the notice. Gating a Retake too keeps the "nothing is sent
      // before acknowledging" promise on every provider-sending path, even for
      // a reader who upgraded with a saved Quiz but no acknowledgement yet.
      async function ensurePrivacyAcknowledged(pending: () => void): Promise<void> {
        const ack = await window.api.getQuizPrivacyNoticeAcknowledged();
        if (!isOk(ack)) {
          failPrivacyGate(`quiz: could not read the privacy notice state: ${ack.error}`, 'Could not check your Quiz privacy choice. Try again.');
          return;
        }
        if (applyQuizPrivacyAction(quizPrivacyNoticeGate(ack.data), 'start-quiz').shown) {
          pendingAfterPrivacyRef.current = pending;
          setPhase('privacy');
          return;
        }
        pending();
      }

      function beginGeneration(force: boolean): void {
        setError(null);
        setAttempt(null);
        setForceNew(force);
        setExtractRange({ start: scope.startPage, end: scope.endPage });
        setPhase('generating');
      }

      return {
        setSize(size) {
          if (isSizeChoice(size)) setSizeState(size);
        },
        widenStart(startPage) {
          setScope(widenScopeChoice(lastPage, startPage));
        },
        async start() {
          if (lastPage < 1) {
            setError('This book has no read progress yet, so a Quiz cannot be made.');
            setPhase('error');
            return;
          }
          await ensurePrivacyAcknowledged(() => beginGeneration(false));
        },
        async acceptPrivacyNotice() {
          const saved = await window.api.acknowledgeQuizPrivacyNotice();
          if (!isOk(saved)) {
            failPrivacyGate(`quiz: could not remember the privacy notice acknowledgement: ${saved.error}`, 'Could not remember your Quiz privacy choice. Try again.');
            return;
          }
          const pending = pendingAfterPrivacyRef.current ?? (() => beginGeneration(false));
          pendingAfterPrivacyRef.current = null;
          pending();
        },
        declinePrivacyNotice() {
          pendingAfterPrivacyRef.current = null;
          setPhase('setup');
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
          setForceNew(false);
          setExtractRange(null);
        },
        retakeSame() {
          if (!quiz) return;
          submittedRef.current = false;
          setError(null);
          setAttempt(null);
          setFlow(initQuizFlow(quiz.questions));
          setPhase('question');
        },
        async retakeNew() {
          if (!quiz) return;
          await ensurePrivacyAcknowledged(() => {
            submittedRef.current = false;
            beginGeneration(true);
          });
        },
        openHistory() {
          setHistory(historyLoading(initialHistory()));
          setPhase('history');
        },
        backFromHistory() {
          setPhase('setup');
        },
        beginReview(attemptToReview) {
          setHistory((current) => beginReview(current, attemptToReview));
          setPhase('review');
        },
        closeReview() {
          setHistory((current) => closeReview(current));
          setPhase('history');
        },
        openSourcePage(page) {
          onClose();
          onOpenAtPage(page);
        },
        close: onClose,
      };
    },
    [lastPage, scope, quiz, onClose, onOpenAtPage],
  );

  return [{ phase, scope, size, error, flow, attempt, history }, actions];
}
