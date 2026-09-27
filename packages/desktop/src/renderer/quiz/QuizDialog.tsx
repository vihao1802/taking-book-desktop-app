import { useEffect } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { BookFile } from '../../shared/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { currentQuestion, isFinished } from './quizFlow';
import { attemptKey, formatAttemptTime } from './quizHistory';
import { resolveQuizKey } from './quizKeys';
import { quizSizeOptions } from './quizSizeChoice';
import { sourcePageJump } from './quizSourcePage';
import { useQuizSession } from './useQuizSession';

/**
 * The Quiz flow's whole dialog: scope/size setup, generating, one question at
 * a time with a reveal, and the final score. Opened from the Book detail or
 * library view — never the reader (see the `Quiz` glossary entry).
 */
export function QuizDialog({
  file,
  onOpenChange,
  onOpenAtPage,
}: {
  file: BookFile;
  onOpenChange: (open: boolean) => void;
  /** Opens the Book in the reader at a question's source page. */
  onOpenAtPage: (page: number) => void;
}) {
  const [state, actions] = useQuizSession(file, () => onOpenChange(false), onOpenAtPage);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {state.phase === 'setup' && <SetupScreen file={file} state={state} actions={actions} />}
        {state.phase === 'privacy' && <PrivacyScreen actions={actions} />}
        {state.phase === 'generating' && <GeneratingScreen label="Writing your Quiz…" />}
        {state.phase === 'error' && <ErrorScreen message={state.error ?? 'Could not generate a Quiz.'} actions={actions} />}
        {state.phase === 'question' && state.flow && !isFinished(state.flow) && (
          <QuestionScreen flow={state.flow} actions={actions} />
        )}
        {state.phase === 'submitting' && <GeneratingScreen label="Saving your score…" />}
        {state.phase === 'score' && <ScoreScreen state={state} actions={actions} />}
        {state.phase === 'history' && <HistoryScreen file={file} state={state} actions={actions} />}
        {state.phase === 'review' && <ReviewScreen state={state} actions={actions} />}
      </DialogContent>
    </Dialog>
  );
}

function SetupScreen({
  file,
  state,
  actions,
}: {
  file: BookFile;
  state: ReturnType<typeof useQuizSession>[0];
  actions: ReturnType<typeof useQuizSession>[1];
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Take a Quiz on “{file.title}”</DialogTitle>
        <DialogDescription>
          {state.scope.isDefault
            ? `Covers pages ${state.scope.startPage}–${state.scope.endPage}, the most recent pages you’ve read.`
            : `Covers pages ${state.scope.startPage}–${state.scope.endPage}.`}
          {' '}Never past where you last left off.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quiz-size">Number of questions</Label>
          <Select value={String(state.size)} onValueChange={(v) => actions.setSize(Number(v))}>
            <SelectTrigger id="quiz-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {quizSizeOptions().map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} questions
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quiz-start-page">Start from page</Label>
          <Input
            id="quiz-start-page"
            type="number"
            min={1}
            max={state.scope.endPage}
            value={state.scope.startPage}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (Number.isFinite(value)) actions.widenStart(value);
            }}
          />
          <p className="text-muted-foreground text-xs">
            Move this earlier to widen the Quiz to more of what you’ve read.
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={actions.openHistory}>
          Past attempts
        </Button>
        <Button variant="outline" onClick={actions.close}>
          Cancel
        </Button>
        <Button onClick={actions.start}>Start Quiz</Button>
      </DialogFooter>
    </>
  );
}

function PrivacyScreen({ actions }: { actions: ReturnType<typeof useQuizSession>[1] }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Before your first Quiz</DialogTitle>
        <DialogDescription>
          To write a Quiz, the text of the pages it covers is sent to the AI provider using your own API key.
          Nothing else leaves this device. This choice is remembered on this device only.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={actions.declinePrivacyNotice}>
          Not now
        </Button>
        <Button onClick={actions.acceptPrivacyNotice}>I understand</Button>
      </DialogFooter>
    </>
  );
}

function GeneratingScreen({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <Loader2 className="text-muted-foreground size-8 animate-spin" />
      <p className="text-muted-foreground text-sm">{label}</p>
    </div>
  );
}

function ErrorScreen({ message, actions }: { message: string; actions: ReturnType<typeof useQuizSession>[1] }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Couldn’t make a Quiz</DialogTitle>
        <DialogDescription>{message}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={actions.close}>
          Close
        </Button>
        <Button onClick={actions.retake}>Try again</Button>
      </DialogFooter>
    </>
  );
}

function QuestionScreen({
  flow,
  actions,
}: {
  flow: NonNullable<ReturnType<typeof useQuizSession>[0]['flow']>;
  actions: ReturnType<typeof useQuizSession>[1];
}) {
  const question = currentQuestion(flow);
  const { selectAnswer, reveal, next, openSourcePage } = actions;

  // Answering with the keyboard: 1–N picks an option, Enter reveals it, and
  // Enter again moves on. Prevent default so a focused button does not also
  // fire its click and double-advance the flow. The source-page jump is the one
  // control the flow must not steal Enter from: when it is focused, Enter (or
  // Space) opens the page instead of advancing, so it stays reachable by
  // keyboard like every other button.
  useEffect(() => {
    if (!question) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as Element | null;
      const jumpButton = target?.closest('[data-quiz-jump]') as HTMLButtonElement | null;
      if (jumpButton && (event.code === 'Enter' || event.code === 'Space')) {
        event.preventDefault();
        jumpButton.click();
        return;
      }
      const action = resolveQuizKey({
        key: event.key,
        revealed: flow.revealed,
        selected: flow.selected,
        optionCount: question.options.length,
      });
      if (!action) return;
      event.preventDefault();
      if (action.type === 'selectOption') selectAnswer(action.index);
      else if (action.type === 'reveal') reveal();
      else next();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [question, flow.revealed, flow.selected, selectAnswer, reveal, next]);

  if (!question) return null;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Question {flow.index + 1} of {flow.questions.length}
        </DialogTitle>
        <DialogDescription>{question.prompt}</DialogDescription>
      </DialogHeader>
      <ul className="flex flex-col gap-2">
        {question.options.map((option, index) => {
          const isSelected = flow.selected === index;
          const isCorrect = index === question.correctIndex;
          return (
            <li key={index}>
              <button
                type="button"
                disabled={flow.revealed}
                onClick={() => selectAnswer(index)}
                className={cn(
                  'w-full cursor-pointer rounded-md border px-3.5 py-2.5 text-left text-sm transition-colors',
                  !flow.revealed && isSelected && 'border-ink bg-secondary',
                  !flow.revealed && !isSelected && 'hover:bg-secondary/50',
                  flow.revealed && isCorrect && 'border-emerald-500 bg-emerald-500/10',
                  flow.revealed && isSelected && !isCorrect && 'border-destructive bg-destructive/10',
                  flow.revealed && 'cursor-default',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  {option}
                  {flow.revealed && isCorrect && <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />}
                  {flow.revealed && isSelected && !isCorrect && <XCircle className="size-4 shrink-0 text-destructive" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {flow.revealed && (
        <p className="text-muted-foreground flex items-baseline gap-1 text-sm">
          {question.explanation}
          <SourcePageButton page={question.sourcePage} onOpen={openSourcePage} />
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        {flow.revealed
          ? 'Enter for the next question · Tab to open the page in the reader'
          : `1–${question.options.length} to pick an answer, Enter to check`}
      </p>
      <DialogFooter>
        {!flow.revealed ? (
          <Button onClick={reveal} disabled={flow.selected === null}>
            Check answer
          </Button>
        ) : (
          <Button onClick={next}>
            {flow.index + 1 < flow.questions.length ? 'Next question' : 'See score'}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

function SourcePageButton({ page, onOpen }: { page: number; onOpen: (page: number) => void }) {
  const jump = sourcePageJump(page);
  return (
    <Button
      variant="link"
      size="sm"
      className="h-auto px-0 text-xs"
      data-quiz-jump
      onClick={() => onOpen(jump.page)}
    >
      {jump.label}
    </Button>
  );
}

function ScoreScreen({
  state,
  actions,
}: {
  state: ReturnType<typeof useQuizSession>[0];
  actions: ReturnType<typeof useQuizSession>[1];
}) {
  const attempt = state.attempt;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Quiz complete</DialogTitle>
        <DialogDescription>
          {attempt
            ? `You scored ${attempt.score} out of ${attempt.total}.`
            : (state.error ?? 'Your attempt could not be saved.')}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col items-start gap-1">
        {attempt != null && attempt.score < attempt.total && (
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-primary h-auto px-0 text-xs"
            onClick={() => actions.beginReview(attempt)}
          >
            Review the questions you got wrong
          </Button>
        )}
        <Button
          variant="ghost"
          className="text-muted-foreground hover:text-primary h-auto px-0 text-xs"
          onClick={actions.openHistory}
        >
          See past attempts
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Same questions reuses what you’ve already got, free and offline. New questions asks the AI to
        write a fresh set.
      </p>
      <DialogFooter>
        <Button variant="ghost" onClick={actions.close}>
          Close
        </Button>
        <Button variant="outline" onClick={actions.retakeSame}>
          Same questions
        </Button>
        <Button onClick={actions.retakeNew}>New questions</Button>
      </DialogFooter>
    </>
  );
}

function HistoryScreen({
  file,
  state,
  actions,
}: {
  file: BookFile;
  state: ReturnType<typeof useQuizSession>[0];
  actions: ReturnType<typeof useQuizSession>[1];
}) {
  const history = state.history;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Past attempts</DialogTitle>
        <DialogDescription>
          Your Quiz attempts for “{file.title}”, newest first. Review an attempt to see the
          questions you got wrong.
        </DialogDescription>
      </DialogHeader>
      {history.status === 'loading' && <GeneratingScreen label="Loading your attempts…" />}
      {history.status === 'error' && <p className="text-destructive text-sm">{history.error}</p>}
      {history.status === 'ready' && history.attempts.length === 0 && (
        <p className="text-muted-foreground text-sm">No past attempts for this book yet.</p>
      )}
      {history.status === 'ready' && history.attempts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {history.attempts.map((attempt) => (
            <li key={attemptKey(attempt)} className="flex items-center justify-between gap-3 rounded-md border px-3.5 py-2.5">
              <span className="flex flex-col">
                <span className="text-sm font-medium">
                  {attempt.score} / {attempt.total}
                </span>
                <span className="text-muted-foreground text-xs">{formatAttemptTime(attempt.completedAt)}</span>
              </span>
              {attempt.score < attempt.total && (
                <Button variant="outline" size="sm" onClick={() => actions.beginReview(attempt)}>
                  Review
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={actions.backFromHistory}>
          Back
        </Button>
      </DialogFooter>
    </>
  );
}

function ReviewScreen({
  state,
  actions,
}: {
  state: ReturnType<typeof useQuizSession>[0];
  actions: ReturnType<typeof useQuizSession>[1];
}) {
  const review = state.history.review;
  if (!review) return null;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Missed questions</DialogTitle>
        <DialogDescription>
          From the attempt where you scored {review.attempt.score} out of {review.attempt.total}. Each
          shows the right answer, why it is right, and the page it came from.
        </DialogDescription>
      </DialogHeader>
      {review.status === 'loading' && <GeneratingScreen label="Loading the questions…" />}
      {review.status === 'error' && <p className="text-destructive text-sm">{review.error}</p>}
      {review.status === 'ready' && review.missed.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nothing missed on this attempt — you got every question right.
        </p>
      )}
      {review.status === 'ready' && review.missed.length > 0 && (
        <ul className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
          {review.missed.map((question, index) => (
            <li key={question.questionId} className="flex flex-col gap-1.5 rounded-md border p-3.5">
              <p className="text-sm font-medium">
                {index + 1}. {question.prompt}
              </p>
              <ul className="flex flex-col gap-0.5">
                {question.options.map((option, optionIndex) => {
                  const isCorrect = optionIndex === question.correctIndex;
                  const isPicked = optionIndex === question.selectedIndex;
                  return (
                    <li
                      key={optionIndex}
                      className={cn(
                        'text-sm',
                        isCorrect && 'text-emerald-600',
                        isPicked && !isCorrect && 'text-destructive',
                      )}
                    >
                      {option}
                      {isCorrect && ' — correct answer'}
                      {isPicked && !isCorrect && ' — your answer'}
                    </li>
                  );
                })}
              </ul>
              <p className="text-muted-foreground flex items-baseline gap-1 text-sm">
                {question.explanation}
                <SourcePageButton page={question.sourcePage} onOpen={actions.openSourcePage} />
              </p>
            </li>
          ))}
        </ul>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={actions.closeReview}>
          Back
        </Button>
      </DialogFooter>
    </>
  );
}
