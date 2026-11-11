const errorResponse = {
  description: 'Ошибка',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
    },
  },
};

const bearer = [{ bearerAuth: [] }];

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Платформа онлайн-опросов',
    version: '1.0.0',
    description: [
      'Создание опросов, публичное прохождение, аналитика и экспорт результатов.',
      'Администратор работает с опросами по JWT. Респондент регистрируется сам.',
      'Публичная ссылка — это `publicSlug`: её можно открыть без регистрации.',
    ].join('\n\n'),
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'Служебное' },
    { name: 'Авторизация' },
    { name: 'Опросы' },
    { name: 'Вопросы' },
    { name: 'Публичный доступ' },
    { name: 'Результаты' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    responses: {
      BadRequest: { ...errorResponse, description: 'Некорректные данные' },
      Unauthorized: { ...errorResponse, description: 'Нужна авторизация или токен недействителен' },
      Forbidden: { ...errorResponse, description: 'Недостаточно прав' },
      NotFound: { ...errorResponse, description: 'Объект не найден' },
      Conflict: { ...errorResponse, description: 'Операция противоречит текущему состоянию' },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: { error: { type: 'string' } },
      },
      User: {
        type: 'object',
        required: ['id', 'email', 'name', 'role'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'respondent'] },
        },
      },
      AuthResult: {
        type: 'object',
        required: ['token', 'user'],
        properties: {
          token: { type: 'string' },
          user: { $ref: '#/components/schemas/User' },
        },
      },
      Survey: {
        type: 'object',
        required: ['id', 'title', 'description', 'status', 'authorId', 'publicSlug', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'published', 'closed'] },
          authorId: { type: 'string', format: 'uuid' },
          publicSlug: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      SurveyCreate: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', example: 'Осенний опрос' },
          description: { type: 'string', example: 'Короткое описание' },
        },
      },
      SurveyUpdate: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
        },
      },
      Option: {
        type: 'object',
        required: ['id', 'text', 'position'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          text: { type: 'string' },
          position: { type: 'integer' },
        },
      },
      Question: {
        type: 'object',
        required: ['id', 'text', 'type', 'required', 'position', 'options'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          surveyId: { type: 'string', format: 'uuid' },
          text: { type: 'string' },
          type: { type: 'string', enum: ['single', 'multi', 'text', 'scale'] },
          required: { type: 'boolean' },
          position: { type: 'integer' },
          scaleMin: { type: 'integer', nullable: true },
          scaleMax: { type: 'integer', nullable: true },
          options: { type: 'array', items: { $ref: '#/components/schemas/Option' } },
        },
      },
      QuestionCreate: {
        type: 'object',
        required: ['text', 'type'],
        properties: {
          text: { type: 'string', example: 'Как вам курс?' },
          type: { type: 'string', enum: ['single', 'multi', 'text', 'scale'] },
          required: { type: 'boolean', default: true },
          options: {
            type: 'array',
            description: 'Для single и multi: минимум два разных варианта, строка или объект `{ "text" }`.',
            items: {
              oneOf: [
                { type: 'string' },
                {
                  type: 'object',
                  required: ['text'],
                  properties: { text: { type: 'string' } },
                },
              ],
            },
            example: ['Лекции', 'Практика'],
          },
          scaleMin: { type: 'integer', example: 1 },
          scaleMax: { type: 'integer', example: 5 },
        },
      },
      QuestionUpdate: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          required: { type: 'boolean' },
          options: {
            type: 'array',
            description: 'Заменяет варианты у single и multi.',
            items: { type: 'string' },
          },
          scaleMin: { type: 'integer' },
          scaleMax: { type: 'integer' },
        },
      },
      PublicSurvey: {
        type: 'object',
        required: ['id', 'title', 'description', 'publicSlug', 'questions'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          description: { type: 'string' },
          publicSlug: { type: 'string' },
          questions: { type: 'array', items: { $ref: '#/components/schemas/Question' } },
        },
      },
      PublicResponseCreate: {
        type: 'object',
        required: ['answers'],
        properties: {
          respondentName: { type: 'string', example: 'Анна' },
          answers: {
            type: 'array',
            description: [
              'Поля ответа зависят от типа вопроса.',
              'single: `optionId`. multi: `optionIds`. text: `text`. scale: целое `value`.',
              'Обязательный вопрос нельзя пропускать.',
            ].join(' '),
            items: {
              type: 'object',
              required: ['questionId'],
              properties: {
                questionId: { type: 'string', format: 'uuid' },
                optionId: { type: 'string', format: 'uuid' },
                optionIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
                text: { type: 'string' },
                value: { type: 'integer' },
              },
            },
          },
        },
      },
      SavedResponse: {
        type: 'object',
        required: ['id', 'surveyId', 'createdAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          surveyId: { type: 'string', format: 'uuid' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ChoiceAnalytics: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          text: { type: 'string' },
          type: { type: 'string', enum: ['single', 'multi'] },
          position: { type: 'integer' },
          answeredCount: { type: 'integer' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                text: { type: 'string' },
                count: { type: 'integer' },
                share: { type: 'number', description: 'Доля среди ответивших на вопрос, от 0 до 1.' },
              },
            },
          },
        },
      },
      TextAnalytics: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          text: { type: 'string' },
          type: { type: 'string', enum: ['text'] },
          position: { type: 'integer' },
          answeredCount: { type: 'integer' },
          answers: { type: 'array', items: { type: 'string' } },
        },
      },
      ScaleAnalytics: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          text: { type: 'string' },
          type: { type: 'string', enum: ['scale'] },
          position: { type: 'integer' },
          answeredCount: { type: 'integer' },
          scaleMin: { type: 'integer' },
          scaleMax: { type: 'integer' },
          average: { type: 'number', nullable: true },
          distribution: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                value: { type: 'integer' },
                count: { type: 'integer' },
              },
            },
          },
        },
      },
      Analytics: {
        type: 'object',
        required: ['surveyId', 'responseCount', 'questions'],
        properties: {
          surveyId: { type: 'string', format: 'uuid' },
          responseCount: { type: 'integer' },
          questions: {
            type: 'array',
            items: {
              oneOf: [
                { $ref: '#/components/schemas/ChoiceAnalytics' },
                { $ref: '#/components/schemas/TextAnalytics' },
                { $ref: '#/components/schemas/ScaleAnalytics' },
              ],
            },
          },
        },
      },
      ExportResponse: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          createdAt: { type: 'string', format: 'date-time' },
          respondentName: { type: 'string' },
          answers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                questionId: { type: 'string', format: 'uuid' },
                question: { type: 'string' },
                type: { type: 'string' },
                value: {},
                display: { type: 'string' },
              },
            },
          },
        },
      },
      SurveyExport: {
        type: 'object',
        required: ['survey', 'exportedAt', 'responseCount', 'questions', 'responses'],
        properties: {
          survey: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              title: { type: 'string' },
              description: { type: 'string' },
              status: { type: 'string', enum: ['draft', 'published', 'closed'] },
              publicSlug: { type: 'string' },
            },
          },
          exportedAt: { type: 'string', format: 'date-time' },
          responseCount: { type: 'integer' },
          questions: {
            type: 'array',
            items: {
              oneOf: [
                { $ref: '#/components/schemas/ChoiceAnalytics' },
                { $ref: '#/components/schemas/TextAnalytics' },
                { $ref: '#/components/schemas/ScaleAnalytics' },
              ],
            },
          },
          responses: { type: 'array', items: { $ref: '#/components/schemas/ExportResponse' } },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Служебное'],
        summary: 'Проверка живости сервиса и базы',
        responses: {
          200: {
            description: 'Сервис и база доступны',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { status: { type: 'string', example: 'ok' } },
                },
              },
            },
          },
          500: { ...errorResponse, description: 'Сервис или база недоступны' },
        },
      },
    },
    '/api/auth/register': {
      post: {
        tags: ['Авторизация'],
        summary: 'Регистрация респондента',
        description: 'Создаёт только роль respondent. Роль admin через этот запрос получить нельзя.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'name', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  name: { type: 'string' },
                  password: { type: 'string', minLength: 8, maxLength: 72 },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Пользователь создан',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResult' } } },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          409: { ...errorResponse, description: 'Email уже занят' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Авторизация'],
        summary: 'Вход',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'admin@example.com' },
                  password: { type: 'string', example: 'admin12345' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Выдан JWT',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResult' } } },
          },
          401: { ...errorResponse, description: 'Неверный email или пароль' },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Авторизация'],
        summary: 'Текущий пользователь',
        security: bearer,
        responses: {
          200: {
            description: 'Профиль',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { user: { $ref: '#/components/schemas/User' } },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/surveys': {
      get: {
        tags: ['Опросы'],
        summary: 'Список своих опросов',
        security: bearer,
        responses: {
          200: {
            description: 'Опросы автора',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { surveys: { type: 'array', items: { $ref: '#/components/schemas/Survey' } } },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Опросы'],
        summary: 'Создать черновик',
        description: 'Статус, автор и публичная ссылка задаются сервером.',
        security: bearer,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SurveyCreate' } } },
        },
        responses: {
          201: {
            description: 'Черновик создан',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { survey: { $ref: '#/components/schemas/Survey' } },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/api/surveys/{id}': {
      get: {
        tags: ['Опросы'],
        summary: 'Получить свой опрос',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/SurveyId' }],
        responses: {
          200: {
            description: 'Опрос',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { survey: { $ref: '#/components/schemas/Survey' } },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Опросы'],
        summary: 'Изменить название или описание',
        description: 'Закрытый опрос редактировать нельзя. Статус здесь не меняется.',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/SurveyId' }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SurveyUpdate' } } },
        },
        responses: {
          200: {
            description: 'Опрос обновлён',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { survey: { $ref: '#/components/schemas/Survey' } },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
      delete: {
        tags: ['Опросы'],
        summary: 'Удалить черновик',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/SurveyId' }],
        responses: {
          204: { description: 'Черновик удалён' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { ...errorResponse, description: 'Удалить можно только черновик' },
        },
      },
    },
    '/api/surveys/{id}/publish': {
      post: {
        tags: ['Опросы'],
        summary: 'Опубликовать черновик',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/SurveyId' }],
        responses: {
          200: {
            description: 'Опрос опубликован',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { survey: { $ref: '#/components/schemas/Survey' } },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/api/surveys/{id}/close': {
      post: {
        tags: ['Опросы'],
        summary: 'Закрыть опубликованный опрос',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/SurveyId' }],
        responses: {
          200: {
            description: 'Опрос закрыт',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { survey: { $ref: '#/components/schemas/Survey' } },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/api/surveys/{id}/questions': {
      get: {
        tags: ['Вопросы'],
        summary: 'Вопросы опроса',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/SurveyId' }],
        responses: {
          200: {
            description: 'Вопросы по порядку',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { questions: { type: 'array', items: { $ref: '#/components/schemas/Question' } } },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      post: {
        tags: ['Вопросы'],
        summary: 'Добавить вопрос в черновик',
        description: 'Порядок назначает сервер. После публикации состав вопросов не меняется.',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/SurveyId' }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/QuestionCreate' } } },
        },
        responses: {
          201: {
            description: 'Вопрос создан',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { question: { $ref: '#/components/schemas/Question' } },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/api/surveys/{id}/questions/{questionId}': {
      patch: {
        tags: ['Вопросы'],
        summary: 'Изменить вопрос черновика',
        description: 'Тип вопроса изменить нельзя.',
        security: bearer,
        parameters: [
          { $ref: '#/components/parameters/SurveyId' },
          { $ref: '#/components/parameters/QuestionId' },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/QuestionUpdate' } } },
        },
        responses: {
          200: {
            description: 'Вопрос обновлён',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { question: { $ref: '#/components/schemas/Question' } },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
      delete: {
        tags: ['Вопросы'],
        summary: 'Удалить вопрос черновика',
        security: bearer,
        parameters: [
          { $ref: '#/components/parameters/SurveyId' },
          { $ref: '#/components/parameters/QuestionId' },
        ],
        responses: {
          204: { description: 'Вопрос удалён' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/api/public/surveys/{slug}': {
      get: {
        tags: ['Публичный доступ'],
        summary: 'Открыть опубликованный опрос',
        description: 'Регистрация не нужна. Черновик скрыт. Закрытый опрос отвечает 409.',
        parameters: [{ $ref: '#/components/parameters/Slug' }],
        responses: {
          200: {
            description: 'Опрос для прохождения',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { survey: { $ref: '#/components/schemas/PublicSurvey' } },
                },
              },
            },
          },
          404: { $ref: '#/components/responses/NotFound' },
          409: { ...errorResponse, description: 'Опрос закрыт' },
        },
      },
    },
    '/api/public/surveys/{slug}/responses': {
      post: {
        tags: ['Публичный доступ'],
        summary: 'Отправить ответы без регистрации',
        description: 'Токен необязателен. Если он передан и действителен, ответ связывается с пользователем. Число ответов с одного IP ограничено.',
        security: [{ bearerAuth: [] }, {}],
        parameters: [{ $ref: '#/components/parameters/Slug' }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/PublicResponseCreate' } } },
        },
        responses: {
          201: {
            description: 'Ответ сохранён',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { response: { $ref: '#/components/schemas/SavedResponse' } },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { ...errorResponse, description: 'Передан недействительный токен' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { ...errorResponse, description: 'Опрос закрыт' },
          429: { ...errorResponse, description: 'Слишком много ответов с этого IP' },
        },
      },
    },
    '/api/surveys/{id}/analytics': {
      get: {
        tags: ['Результаты'],
        summary: 'Сводка ответов',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/SurveyId' }],
        responses: {
          200: {
            description: 'Аналитика',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { analytics: { $ref: '#/components/schemas/Analytics' } },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/surveys/{id}/export/json': {
      get: {
        tags: ['Результаты'],
        summary: 'Экспорт результатов в JSON',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/SurveyId' }],
        responses: {
          200: {
            description: 'Файл JSON',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SurveyExport' } } },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/surveys/{id}/export/pdf': {
      get: {
        tags: ['Результаты'],
        summary: 'Экспорт результатов в PDF',
        description: 'Отчёт собирается шаблоном EJS и печатается в PDF.',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/SurveyId' }],
        responses: {
          200: {
            description: 'Файл PDF',
            content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
  },
};

openapi.components.parameters = {
  SurveyId: {
    name: 'id',
    in: 'path',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  },
  QuestionId: {
    name: 'questionId',
    in: 'path',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  },
  Slug: {
    name: 'slug',
    in: 'path',
    required: true,
    schema: { type: 'string' },
  },
};
