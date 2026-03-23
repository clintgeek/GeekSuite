import GuidedStepsTemplate from './guidedStepsTemplate';

const lessonTemplateRegistry = {
  guided_steps_v1: GuidedStepsTemplate,
};

// eslint-disable-next-line react-refresh/only-export-components
export function getLessonTemplateComponent(lesson) {
  if (!lesson) return null;
  const key = lesson.template;
  if (!key) return null;
  return lessonTemplateRegistry[key] || null;
}

export default function LessonTemplateRenderer(props) {
  const { lesson } = props;
  const Template = getLessonTemplateComponent(lesson);

  if (!Template) {
    return null;
  }

  return <Template {...props} />;
}
