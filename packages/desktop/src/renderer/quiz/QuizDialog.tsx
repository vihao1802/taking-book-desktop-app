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
import { quizSizeOptions } from './quizSizeChoice';
import { useQuizSession } from './useQuizSession';

/**
 * The Quiz flow's whole dialog: scope/size setup, generating, one question at
 * a time with a reveal, and the final score. Opened from the Book detail or
 * library view — never the reader (see the `Quiz` glossary entry).
 */
export function QuizDialog({ file, onOpenChange }: { file: BookFile; onOpenChange: (open: boolean) => void }) {
  const [state, actions] = useQuizSession(file, () => onOpenChange(false));

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {state.phase === 'setup' && <SetupScreen file={file} state={state} actions={actions} />}
        {state.phase === 'generating' && <GeneratingScreen label="Writing your Quiz…" />}
        {state.phase === 'error' && <ErrorScreen message={state.error ?? 'Could not generate a Quiz.'} actions={actions} />}
        {state.phase === 'question' && state.flow && !isFinished(state.flow) && (
          <QuestionScreen flow={state.flow} actions={actions} />
        )}
        {state.phase === 'submitting' && <GeneratingScreen label="Saving your score…" />}
        {state.phase === 'score' && <ScoreScreen state={state} actions={actions} />}
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
        <Button variant="outline" onClick={actions.close}>
          Cancel
        </Button>
        <Button onClick={actions.start}>Start Quiz</Button>
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
                onClick={() => actions.selectAnswer(index)}
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
        <p className="text-muted-foreground text-sm">
          {question.explanation} <span className="whitespace-nowrap">(page {question.sourcePage})</span>
        </p>
      )}
      <DialogFooter>
        {!flow.revealed ? (
          <Button onClick={actions.reveal} disabled={flow.selected === null}>
            Check answer
          </Button>
        ) : (
          <Button onClick={actions.next}>
            {flow.index + 1 < flow.questions.length ? 'Next question' : 'See score'}
          </Button>
        )}
      </DialogFooter>
    </>
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
      <DialogFooter>
        <Button variant="outline" onClick={actions.close}>
          Close
        </Button>
        <Button onClick={actions.retake}>Take again</Button>
      </DialogFooter>
    </>
  );
}
