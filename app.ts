import axios from 'axios';
import _, { entries } from 'lodash';
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';

dayjs.extend(weekOfYear);

type Post = {
  id: string;
  from_name: string;
  from_id: string;
  message: string;
  type: string;
  created_time: Date;
};

type RegisterResponse = {
  sl_token: string;
  client_id: string;
  email: string;
};

type GetPostsResponse = {
  page: number;
  posts: Post[];
};

/*****************************************/

async function calcStats() {
  const BASE_URL: string = 'https://api.supermetrics.com/assignment';
  const CLIENT_ID: string = 'ju16a6m81mhid5ue1z3v2g0uh';

  async function register(email: string, name: string): Promise<RegisterResponse> {
    const body = { client_id: CLIENT_ID, email, name };
    const data: RegisterResponse = await axios
      .post(`${BASE_URL}/register`, body)
      .then(resp => resp.data.data)
      .catch(err => console.log(err));

    return data;
  }

  async function getPosts(params: { [key: string]: string | number }): Promise<GetPostsResponse> {
    const stringifiedParams = Object.keys(params).map(key => `${key}=${params[key]}`);
    const data: GetPostsResponse = await axios
      .get(`${BASE_URL}/posts?${stringifiedParams.join('&')}`)
      .then(resp => resp.data.data)
      .catch(err => console.log(err));

    return data;
  }

  /************************/

  // Register a new user an gets a new token
  const newReg = await register('cristiandmocho@gmail.com', 'Cristian Mocho');

  // Is there a token?
  if (!newReg?.sl_token) {
    console.log('Something went wrong: No token was issued for this user');
    process.exit(1); // Assuming a code (1) for this type of error
  }

  /*********************************************************************************************************
  For the stats calculation, we can do it in two ways:

  1. The "easy" way, which is to fetch all 10 pages and store in a local array, then calculate the stats;
  2. Fetch each page, pre-calculating the values for each page (discarding the data fetched in this case) 
     and sum/average the results afterwards.

  Caveat: the first approach can lead to a 429 (Too Many Requests) error if the server has Rate Limiting!
  The solution would be to make the requests on a timer, or in blocks of 2-5 requests at a time.
**********************************************************************************************************/

  // Start fetching the posts (the "easy" way...)
  const posts: Post[] = [];
  const requests: Promise<GetPostsResponse>[] = [];

  for (let i = 1; i <= 10; i++) {
    requests.push(getPosts({ page: i, sl_token: newReg.sl_token }));
  }

  // When ALL the request are done
  return Promise.all(requests)
    .then(resp => {
      let posts: Post[] = [];

      // Concatenate all the arrays
      resp.forEach(row => {
        posts = [
          ...posts,
          ...row.posts.map(p => {
            p.created_time = new Date(p.created_time); // Serialize into "Date"
            return p;
          }),
        ];
      });

      /* Starts calculating the stats for this payload
        a. - Average character length of posts per month
        b. - Longest post by character length per month
        c. - Total posts split by week number
        d. - Average number of posts per user per month
      */

      const months = 'JAN,FEB,MAR,APR,MAY,JUN,JUL,AUG,SEP,OCT,NOV,DEC'.split(',');

      // a. Average character length of posts per month
      const postsPerMonth = _.groupBy(posts, (row: Post) => row.created_time.getMonth());

      const averageLengths = Object.keys(postsPerMonth).map(m => {
        const monthPosts: Post[] = postsPerMonth[m];
        const averageLength: number = monthPosts.map(p => p.message.length).reduce((a, b) => a + b) / monthPosts.length;

        return { month: months[Number(m)], value: averageLength };
      });

      // b. - Longest post by character length per month
      const maxLengthPosts = Object.keys(postsPerMonth).map(m => {
        const monthPosts: Post[] = postsPerMonth[m];
        const maxLengthPost: Post | null | undefined = _.maxBy(monthPosts, p => p.message.length);

        return { month: months[Number(m)], length: maxLengthPost?.message.length, post: maxLengthPost };
      });

      // c. - Total posts split by week number
      const postsPerWeek = _.groupBy(posts, p => dayjs(p.created_time).week());
      const numPostsPerWeek = Object.keys(postsPerWeek).map(w => {
        return { week: Number(w), numOfPosts: postsPerWeek[w].length };
      });

      // d. - Average number of posts per user per month
      type entries = { user: string; numOfPosts: number };

      const averagePerUserPerMonth = Object.keys(postsPerMonth).map(m => {
        const monthPosts: Post[] = postsPerMonth[m];
        const postsPerUser = _.groupBy(monthPosts, p => p.from_id);

        return {
          month: months[Number(m)],
          postsPerUser: _.sortBy(
            Object.keys(postsPerUser).map<entries>(key => {
              return { user: key, numOfPosts: postsPerUser[key].length };
            }),
            row => row.user
          ),
        };
      });

      // Returns a JSON with the results
      return {
        averageLengths,
        maxLengthPosts,
        numPostsPerWeek,
        averagePerUserPerMonth,
      };
    })
    .catch(err => console.log(err));
}

async function main() {
  const stats = await calcStats();
  console.log(stats);
}

main();
