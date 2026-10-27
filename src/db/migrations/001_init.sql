-- Пользователь. Роль определяет, кто создаёт опросы, а кто только отвечает.
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'respondent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Опрос: название, описание, статус и автор.
-- public_slug — короткая публичная ссылка, по ней проходят без регистрации.
CREATE TABLE surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  author_id UUID NOT NULL REFERENCES users (id),
  public_slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX surveys_author_id_idx ON surveys (author_id);

-- Вопрос принадлежит опросу. Тип задаёт, как проверять ответ.
-- Для scale хранятся границы шкалы, для остальных типов они пустые.
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys (id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('single', 'multi', 'text', 'scale')),
  required BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER NOT NULL CHECK (position >= 0),
  scale_min INTEGER,
  scale_max INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (survey_id, position),
  CONSTRAINT questions_scale_bounds CHECK (
    (
      type = 'scale'
      AND scale_min IS NOT NULL
      AND scale_max IS NOT NULL
      AND scale_min < scale_max
    )
    OR (
      type <> 'scale'
      AND scale_min IS NULL
      AND scale_max IS NULL
    )
  )
);

CREATE INDEX questions_survey_id_idx ON questions (survey_id);

-- Варианты ответа нужны только для single и multi.
CREATE TABLE question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  UNIQUE (question_id, position)
);

CREATE INDEX question_options_question_id_idx ON question_options (question_id);

-- Прохождение опроса. Респондент может быть зарегистрирован или анонимен.
-- ip_address нужен для ограничения частоты публичных ответов.
CREATE TABLE responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys (id) ON DELETE CASCADE,
  respondent_id UUID REFERENCES users (id),
  respondent_name TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX responses_survey_ip_created_idx
  ON responses (survey_id, ip_address, created_at);

-- Один ответ на вопрос внутри прохождения.
-- text_value — свободный текст, number_value — значение шкалы.
-- Выбранные варианты лежат отдельно в answer_options.
CREATE TABLE answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL REFERENCES responses (id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions (id),
  text_value TEXT,
  number_value INTEGER,
  UNIQUE (response_id, question_id),
  CONSTRAINT answers_single_payload CHECK (
    (CASE WHEN text_value IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN number_value IS NOT NULL THEN 1 ELSE 0 END) <= 1
  )
);

CREATE INDEX answers_response_id_idx ON answers (response_id);
CREATE INDEX answers_question_id_idx ON answers (question_id);

CREATE TABLE answer_options (
  answer_id UUID NOT NULL REFERENCES answers (id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES question_options (id),
  PRIMARY KEY (answer_id, option_id)
);
