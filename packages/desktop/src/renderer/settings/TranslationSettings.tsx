import { SUPPORTED_LANGUAGES } from '@taking-book/core';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTargetLanguage } from './useTargetLanguage';

const TARGET_LANGUAGE_PICKER_ID = 'target-language';

/** Settings section for choosing the Target language that Translations are shown in. */
export function TranslationSettings() {
  const { language, error, chooseLanguage } = useTargetLanguage();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Translation</CardTitle>
        <CardDescription>Choose the language selected text is translated into.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label htmlFor={TARGET_LANGUAGE_PICKER_ID}>Target language</Label>
          <Select value={language ?? undefined} onValueChange={chooseLanguage} disabled={language === null}>
            <SelectTrigger id={TARGET_LANGUAGE_PICKER_ID} className="min-w-48">
              <SelectValue placeholder="Loading…" />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LANGUAGES.map((option) => (
                <SelectItem key={option.code} value={option.code}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <p className="text-muted-foreground">
          To translate, the text you select is sent to Google Translate over the internet.
        </p>
      </CardContent>
    </Card>
  );
}
