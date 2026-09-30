import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'OmniAgent AI Platform | Universal AI Agent Infrastructure',
  description:
    'Universal AI Agent Platform with secure REST API, key management, multi-project agents, tool calling, and admin playground powered by Google Gemini.',
  openGraph: {
    title: 'OmniAgent AI Platform | Universal AI Agent Infrastructure',
    description:
      'Universal AI Agent Platform with secure REST API, key management, multi-project agents, tool calling, and admin playground powered by Google Gemini.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OmniAgent AI Platform | Universal AI Agent Infrastructure',
    description:
      'Universal AI Agent Platform with secure REST API, key management, multi-project agents, tool calling, and admin playground powered by Google Gemini.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof window === 'undefined') return;
                try {
                  var desc = Object.getOwnPropertyDescriptor(window, 'fetch');
                  if (desc && desc.get && !desc.set && desc.configurable) {
                    var initialGetter = desc.get;
                    var overriddenVal;
                    var isOverridden = false;
                    Object.defineProperty(window, 'fetch', {
                      get: function() { return isOverridden ? overriddenVal : initialGetter.call(this); },
                      set: function(val) { overriddenVal = val; isOverridden = true; },
                      configurable: true,
                      enumerable: desc.enumerable !== false
                    });
                  }
                } catch (e) {}
                try {
                  var origDefine = Object.defineProperty;
                  Object.defineProperty = function(obj, prop, d) {
                    if ((obj === window || obj === globalThis) && prop === 'fetch') {
                      if (d && d.get && !d.set) {
                        var getter = d.get;
                        var currentVal;
                        var hasVal = false;
                        d.set = function(val) {
                          currentVal = val;
                          hasVal = true;
                        };
                        d.get = function() {
                          return hasVal ? currentVal : getter.call(this);
                        };
                        d.configurable = true;
                      }
                    }
                    return origDefine.call(Object, obj, prop, d);
                  };
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
