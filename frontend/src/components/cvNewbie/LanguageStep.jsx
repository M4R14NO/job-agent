import { Portal, Select, createListCollection } from "@chakra-ui/react";
import { CV_OUTPUT_LANGUAGES } from "../../constants/outputLanguages";

const LANGUAGE_ITEMS = CV_OUTPUT_LANGUAGES.map((language) => ({
  value: language.value,
  label: `${language.flag} ${language.label}`,
  name: language.label,
  flag: language.flag
}));

const LANGUAGE_COLLECTION = createListCollection({ items: LANGUAGE_ITEMS });

export default function LanguageStep({ cvOutputLanguage, onCvOutputLanguageChange, hasDraft }) {
  return (
    <div className="cv-step-content">
      {hasDraft ? (
        <div className="cv-step-note">
          Draft already generated. Regenerate after changing the output language.
        </div>
      ) : null}
      <div className="cv-step-field cv-language-step">
        <Select.Root
          collection={LANGUAGE_COLLECTION}
          value={cvOutputLanguage ? [cvOutputLanguage] : []}
          onValueChange={(details) => onCvOutputLanguageChange(details.value?.[0] || "english")}
          positioning={{ sameWidth: true }}
          className="cv-language-select"
        >
          <Select.HiddenSelect id="cvNewbieLanguage" name="cvNewbieLanguage" />
          <Select.Label className="label">Output language</Select.Label>
          <Select.Control>
            <Select.Trigger>
              <Select.ValueText placeholder="Select output language" />
            </Select.Trigger>
            <Select.IndicatorGroup>
              <Select.Indicator />
            </Select.IndicatorGroup>
          </Select.Control>
          <Portal>
            <Select.Positioner>
              <Select.Content>
                {LANGUAGE_COLLECTION.items.map((language) => (
                  <Select.Item item={language} key={language.value}>
                    <Select.ItemText>{language.label}</Select.ItemText>
                    <Select.ItemIndicator />
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Positioner>
          </Portal>
        </Select.Root>
        <p className="helper">Choose the language for headings and output text.</p>
      </div>
    </div>
  );
}
