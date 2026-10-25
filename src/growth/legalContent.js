// Public publication settings only. Replace bracketed values with verified, approved facts.
// Never use test-account addresses or infer a legal entity/jurisdiction from a hosting region.
export const legalPublication = Object.freeze({
 entity: {label:'Service operator',value:'[LEGAL_ENTITY_NAME — owner to complete]'},
 address: {label:'Business address',value:'[BUSINESS_ADDRESS — owner to complete]'},
 privacyContact: {label:'Privacy contact',value:'[PRIVACY_CONTACT — owner to complete]'},
 serviceContact: {label:'Service and legal contact',value:'[SERVICE_LEGAL_CONTACT — owner to complete]'},
 effectiveDate: {label:'Effective date',value:'[EFFECTIVE_DATE — set after publication approval]'},
 governingLaw: {label:'Governing law and forum',value:'[GOVERNING_LAW_AND_FORUM — professional legal review required]'},
 retention: {label:'Retention schedule',value:'[RETENTION_SCHEDULE — owner and legal reviewer to approve]'},
})
export const legalDocuments = {
 privacy: {
  title:'Privacy Policy',description:'How Stockwise and Nexops handle account, workspace, consultation and usage information, communications, privacy choices and deletion requests.',
  intro:'Stockwise is the customer-facing software product. Nexops describes its managed-service and operator context. This policy explains information handling in the current service, including the synthetic demo and separate customer workspaces.',
  publicationFields:['entity','address','privacyContact','serviceContact','effectiveDate','retention'],
  sections:[
   {id:'information',title:'1. Information we handle',paragraphs:[
    'Account information includes your email address, sign-in credentials handled by Supabase Auth, email-confirmation and session information. Profile records include language, communication preferences and free-access dates. Workspace records include names, market, organization and workspace memberships, roles, invitations and progress through getting started.',
    'Consultation requests include company, contact name, contact email, market and the operational problem you describe. You may also provide role, industry, company size, tools, approximate SKU and supplier counts, hiring information and a potential pilot scope. Provide only information you are authorized to share and avoid unnecessary sensitive personal information.',
    'Customer operational data is processed when you intentionally provide it through a supported feature or an agreed service process. The existing StockWise analytics tools support CSV inventory and planning inputs; some inventory records are saved to Supabase and planning inputs may be stored in your browser. Creating a Nexops customer workspace alone does not import inventory, purchase orders or supplier records. The current managed-service workspace has no automatic ERP or supplier connection.',
    'Signed-in usage records include account-linked events and getting-started progress, such as opening the demo, viewing TODAY, reviewing an exception or submitting a consultation. Consultation qualification uses submitted business signals to help operators prioritize follow-up; the score is not a decision about credit, employment or a guaranteed engagement.',
   ]},
   {id:'uses',title:'2. How information is used',paragraphs:[
    'We use information to authenticate accounts, provide and secure workspaces, maintain access permissions and progress, display the demo or intentionally supplied data, respond to requests, support authorized managed-service work and administer communication preferences.',
    'Application audit and delivery records support security, abuse prevention, review of sensitive actions, duplicate prevention and investigation of delivery problems. Optional consented analytics helps us understand and improve product use. Consultation details may be reviewed and exported by permitted workspace users for business follow-up; submitting a request does not subscribe you to marketing.',
   ]},
   {id:'separation',title:'3. Demo data, customer data and access',paragraphs:[
    'Operational demo risks, purchase orders, suppliers and recommendations are synthetic. Demo edits are stored in browser-local storage and are not imported as real customer operations. Account membership and getting-started progress are persisted separately. Separate customer workspaces start empty of operational data.',
    'Account, organization and workspace permissions restrict access according to assigned roles. Authorized workspace participants and authorized service operators or administrators may access information needed for their permitted work. A workspace owner is not automatically an internal service administrator. These controls reduce unauthorized access but do not guarantee absolute security.',
    'Demo edits and other locally saved inputs can remain on a shared browser after sign-out. Use the demo reset where available or clear the relevant browser site data when appropriate; clearing browser data does not delete server-held account records.',
   ]},
   {id:'analytics',title:'4. Browser storage and optional analytics',paragraphs:[
    'Browser storage supports authentication sessions, preferences, saved demo edits and local planning features. Checkout retry identifiers may also be stored locally if that feature is used. This storage is distinct from optional product analytics.',
    'Optional PostHog analytics is off until you allow it. When configured and allowed, it receives permitted event names and limited context such as language, market, screen and workspace type, together with a random browser identifier. Signed-in events may use an internal account identifier and link the earlier browser identifier to that account. The application excludes contact details, consultation text, passwords, invitation tokens and uploaded file contents from these analytics payloads.',
    'You can decline the analytics prompt or change the optional analytics setting in Account on each browser. Withdrawal stops future optional analytics from that browser; it does not recall events already transmitted. Essential account/progress events in the service database and infrastructure security records are separate and are not disabled by this optional analytics choice.',
   ]},
   {id:'providers',title:'5. Service providers and sharing',paragraphs:[
    'Supabase provides authentication and database infrastructure for account, workspace and related service records. Google/Gmail supports authorized messages from the operator-controlled sender account; recipient addresses and message content are processed to deliver those messages. Ordinary signup does not connect your personal mailbox.',
    'The Vercel hosting architecture serves the application and its serverless endpoints. Hosting and authentication providers receive technical request information, such as network addresses and request headers, and may maintain technical/security logs under their configured services. The application also keeps its own product, review and delivery audit records; it does not promise a complete record of every action.',
    'PostHog is a supported optional analytics provider, used only when configured and consented to as described above. A configured Google Calendar appointment link opens a separate Google service if you choose to use it. Production billing is disabled; the current managed-service signup does not collect payment-card details. Stripe checkout code is available for separately authorized future billing activation and would require appropriate payment disclosures before use.',
    'Information may also be shared with authorized workspace participants or service personnel for the purposes described here, or where necessary to respond to applicable legal requirements or protect the service and its users. The managed-service workspace currently has no automatic CRM or ERP connection. Permitted users can export qualified consultation contact information for reviewed business follow-up.',
   ]},
   {id:'communications',title:'6. Service messages and optional reminders',paragraphs:[
    'Account/security messages, a requested consultation response and a workspace invitation are service-related communications and may be distinct from optional promotional or reminder messages. A consultation acknowledgment confirms receipt only, not an appointment, service scope or commercial commitment.',
    'Optional activation, product and consultation reminders use communication preferences in Account. Marketing/reminder opt-in is off by default and can be changed there. The current Gmail delivery runtime is disabled by default and supports restricted approved-recipient tests; it is not unrestricted customer mailing. Approved templates, recipient checks, suppression, duplicate/rate controls and human review or authorization gates protect permitted outbound actions. Current restricted tests additionally require explicit recipient opt-in.',
    'Updating preferences affects future eligible processing; a message already in flight cannot be recalled instantly. Required authentication/security messages and a directly requested service response are not a promise of marketing subscription. Do not rely on email as proof that a supplier, payment or purchase-order change has been authorized.',
   ]},
   {id:'retention',title:'7. Retention, access and deletion requests',paragraphs:[
    'The current implementation has no published automatic purge schedule. Account, workspace, consultation, progress and audit records may remain until an administrator handles a valid request or applies an approved retention process. A formal retention schedule, including provider logs, backups and necessary security/legal exceptions, must be approved in the publication details above. We do not promise a deletion deadline or automatic backup erasure that has not been established.',
    'Use Account to update supported profile/preferences or submit Request account and data deletion. This records a request for administrative handling; it does not immediately close the account, erase records or remove shared workspace data. The operator may need to verify the request, clarify its scope and coordinate shared-workspace ownership. Account closure and deletion completion require follow-up.',
    'For access, correction, export or other privacy requests not provided by the interface, use the verified privacy contact once completed above. Available rights and any necessary retention depend on applicable law and the request. Browser-local copies must also be reset or cleared on the devices where they are stored.',
   ]},
   {id:'security',title:'8. Security',paragraphs:[
    'The implementation uses authenticated sessions, server-side account checks, organization/workspace access restrictions and role-based review controls. Privileged database credentials and sender OAuth credentials are kept on the backend. Sensitive outbound actions require the applicable authorization and review gates.',
    'These safeguards do not make a cloud service risk-free. Protect your credentials, use appropriate device security, share invitation links privately and report suspected unauthorized access through the service contact. No security certification or guarantee is claimed.',
   ]},
   {id:'international',title:'9. International use',paragraphs:[
    'The service is intended for business use, including English-speaking APAC markets. Cloud providers may process information in the United States and other countries. This version does not promise a particular data-residency region or a verified international transfer mechanism. Deployment locations, applicable transfer requirements and any required contractual arrangements need operator and professional review before commitments are made.',
   ]},
   {id:'children',title:'10. Children',paragraphs:[
    'Stockwise is a business service and is not intended for children. The current signup flow does not include dedicated age verification. If you believe a child has provided personal information, use the privacy contact so the operator can assess and address the request.',
   ]},
   {id:'changes',title:'11. Policy changes and contact',paragraphs:[
    'We may update this policy to reflect changes in the service and information handling. The published version should identify its effective date; material changes should be communicated appropriately before they take effect, as required by applicable law. The pending publication fields above must be completed before public launch.',
    'Direct privacy questions and requests to the privacy contact listed above. This product-specific draft is prepared for professional legal review; attorney review, legal compliance and certification are not claimed.',
   ]},
  ],
 },
 terms: {
  title:'Terms of Service',description:'Terms for Stockwise software and the Nexops managed-service context, including accounts, customer data, synthetic demos, decision support, consultations and free access.',
  intro:'These terms describe use of Stockwise software and the Nexops managed-service context provided by the operator identified below. They cover the demo, workspaces, decision-support tools and consultation requests. They are prepared for professional review and are not a signed managed-service engagement.',
  publicationFields:['entity','address','serviceContact','effectiveDate','governingLaw'],
  sections:[
   {id:'service',title:'1. The service',paragraphs:[
    'Stockwise provides inventory and planning software and workspace tools for reviewing inventory, purchase-order and supplier exceptions, actions and customer decisions. Nexops describes the operator and managed-service context. Availability of particular functions depends on the version, permissions and any separately agreed service scope.',
    'A new managed-service customer workspace starts without operational inventory, purchase orders or supplier data. Opening a workspace does not establish an external connection or import customer records. The existing analytics tools and synthetic demo have their own clearly identified data inputs.',
   ]},
   {id:'accounts',title:'2. Accounts and authority',paragraphs:[
    'Provide accurate account information, keep your sign-in credentials secure and use only accounts and workspaces you are authorized to access. If you act for a business, you must have authority to provide its data and request the relevant service on its behalf.',
    'Do not share personal login credentials. Workspace membership and invitations are the supported way to give colleagues appropriate access. Promptly report suspected account misuse and keep invitation links private.',
   ]},
   {id:'acceptable-use',title:'3. Acceptable use',paragraphs:[
    'Do not use the service unlawfully, submit data you have no right to use, attempt unauthorized access, bypass permissions or review gates, misuse credentials, interfere with systems, introduce malicious content or abuse consultation, invitation or messaging functions. Do not use demo recommendations to misrepresent verified customer or supplier results.',
   ]},
   {id:'customer-data',title:'4. Customer data',paragraphs:[
    'You retain your rights in customer-provided data and content. You are responsible for its accuracy, lawful collection and your authority to provide and use it, including information about colleagues, suppliers or other people. Provide only what is needed for the intended work.',
    'You permit the operator and its service providers to process that data as needed to provide, secure and support the requested service as described in the Privacy Policy and any separate agreement. These terms do not transfer ownership of your data or grant an unrestricted right to reuse it.',
    'Customer operational inputs are processed only through supported features or an agreed process. You remain responsible for maintaining appropriate source records and backups; the demo and local browser storage are not a guaranteed system of record.',
   ]},
   {id:'demo',title:'5. Synthetic demo',paragraphs:[
    'Demo inventory, purchase orders, suppliers, exceptions and recommendations are synthetic examples. They illustrate workflows and are not verified customer operational facts, real supplier confirmations or evidence of business performance. Browser-local demo edits do not upload real operational records to your customer workspace.',
   ]},
   {id:'decisions',title:'6. Decision support and external actions',paragraphs:[
    'Recommendations, priorities, reports and simulations support human judgment. Check the underlying data, assumptions and business context before acting. You retain responsibility for procurement, inventory, financial, contractual and other business decisions.',
    'The application does not automatically modify purchase orders, supplier selections, contract terms, prices, payments or external operational systems. Internal permissions and human review/authorization gates apply to sensitive outbound actions; a suggested or reviewed action is not itself authority to commit your business.',
    'No inventory, supply-chain, financial, operational or commercial outcome is guaranteed. Do not treat a demo, recommendation or report as legal, financial or other professional advice.',
   ]},
   {id:'consultations',title:'7. Consultations and managed services',paragraphs:[
    'Submitting a consultation records a request for follow-up only. It does not confirm an appointment, acceptance of work, scope, engagement, service level, response deadline, result or commercial commitment. Any acknowledgment confirms receipt only.',
    'Paid or ongoing managed services may require a separate written agreement covering scope, responsibilities, pricing and authorization. No supplier communication, expedite cost or other external commitment is authorized merely by submitting a request.',
   ]},
   {id:'free-access',title:'8. Current free access',paragraphs:[
    'The current managed-service offer provides a 30-day free-access period starting at account registration, with the end date shown in Account/workspace information. No credit card or payment wall is enabled in this flow and signup does not automatically create a paid subscription.',
    'Free access is not a promise of permanent free service, guaranteed availability or an automatic paid conversion after 30 days. Any extension or later access offer should be stated separately; the current interface is not a promise of automatic account deletion or immediate lockout when the period ends.',
   ]},
   {id:'billing',title:'9. Future paid services',paragraphs:[
    'Production billing is currently disabled. Legacy checkout and payment-provider integration code exists but is not an active paid offer or permission to charge you. It cannot be enabled merely by signing up or requesting a consultation.',
    'Any future paid service requires separate activation and clear disclosure of the applicable service, price, billing interval, taxes and cancellation/refund terms before payment is requested. No future paid terms or automatic charge are established by this draft.',
   ]},
   {id:'ownership',title:'10. Software and intellectual property',paragraphs:[
    'The operator and its licensors retain their respective rights in the software, product design and service materials. Subject to applicable agreed terms and your permissions, you may use the service for your authorized business purposes. This does not grant ownership of the software or authority to redistribute or misuse protected materials. Your rights in customer-provided content remain yours.',
   ]},
   {id:'availability',title:'11. Availability and changes',paragraphs:[
    'The service may be updated, limited, interrupted or unavailable because of maintenance, security needs, provider issues or product changes. No uninterrupted availability or service-level commitment is made without a separate agreement. Material changes to an agreed service should be communicated appropriately.',
   ]},
   {id:'disclaimers',title:'12. Disclaimers and responsibility',paragraphs:[
    'Subject to applicable law and any separate agreement, the service and illustrative materials are provided on an as-available basis, without a promise that they are error-free, complete or suitable for every business decision. Validate outputs before relying on them.',
    'Professional legal review required: any enforceable warranty exclusions, allocation of losses and limitation of liability must be reviewed for the actual operator, service scope and applicable law. No monetary liability cap, waiver of non-excludable rights, indemnity obligation or jurisdiction-specific remedy is established by this draft. Nothing here is intended to exclude rights that cannot lawfully be excluded.',
   ]},
   {id:'closure',title:'13. Suspension, closure and deletion',paragraphs:[
    'The operator may restrict or suspend access where reasonably necessary to address misuse, unauthorized access or security risks, subject to applicable law and any separate agreement. Where appropriate, the operator should explain the restriction and possible recovery steps.',
    'You may request account closure and data deletion through Account. The current process records an administrative request, not immediate or automatic deletion. Identity verification, shared workspace ownership, necessary retention and local copies may require follow-up as described in the Privacy Policy.',
   ]},
   {id:'law-contact',title:'14. Operator, governing law and changes',paragraphs:[
    'The operator identity, business address, service/legal contact, effective date and governing law/forum are publication fields above. They must be verified and completed by the operator with professional review before public launch; the cloud hosting location does not establish a governing jurisdiction.',
    'Updated terms should identify their effective date and material changes should be communicated appropriately. A separately signed commercial agreement may establish additional service-specific terms for that engagement. Questions should be directed to the verified service/legal contact once completed above.',
   ]},
  ],
 },
}
